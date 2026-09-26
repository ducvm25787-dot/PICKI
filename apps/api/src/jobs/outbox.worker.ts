import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { outboxEvents, type PickiDb } from "@picki/db";
import { NotificationService } from "../modules/notifications/notification.service.js";
import { PICKI_DB } from "../shared/tokens.js";

const POLL_MS = 3000;
const BATCH = 20;

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastOpeningCheck = 0;

  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);
    void this.tick();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const pending = await this.db
        .select()
        .from(outboxEvents)
        .where(eq(outboxEvents.status, "PENDING"))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(BATCH);

      for (const event of pending) {
        await this.processOne(event.id);
      }
      if (Date.now() - this.lastOpeningCheck > 60_000) {
        this.lastOpeningCheck = Date.now();
        await this.notifications.notifyDueOpenings();
        await this.notifications.notifyDueExperienceInterests();
      }
    } catch (err) {
      this.logger.error("Outbox poll failed", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }

  private async processOne(eventId: string): Promise<void> {
    const claimed = await this.db
      .update(outboxEvents)
      .set({ status: "PROCESSING" })
      .where(and(eq(outboxEvents.id, eventId), eq(outboxEvents.status, "PENDING")))
      .returning();

    const event = claimed[0];
    if (!event) return;

    try {
      if (event.eventType === "order.status_changed") {
        await this.notifications.processOrderStatusChanged(
          event.payload as Parameters<NotificationService["processOrderStatusChanged"]>[0],
        );
      } else if (event.eventType === "message.received") {
        await this.notifications.processMessageReceived(
          event.payload as Parameters<NotificationService["processMessageReceived"]>[0],
        );
      } else if (event.eventType === "order.seeking_runner") {
        await this.notifications.processSeekingRunner(
          event.payload as Parameters<NotificationService["processSeekingRunner"]>[0],
        );
      } else if (event.eventType === "order.provider_handoff") {
        await this.notifications.processProviderHandoff(
          event.payload as Parameters<NotificationService["processProviderHandoff"]>[0],
        );
      } else if (event.eventType === "runner.arrived_lobby") {
        await this.notifications.processRunnerArrivedLobby(
          event.payload as Parameters<NotificationService["processRunnerArrivedLobby"]>[0],
        );
      } else if (event.eventType.startsWith("service_request.")) {
        await this.notifications.processServiceRequest(
          event.eventType,
          event.payload as Parameters<NotificationService["processServiceRequest"]>[1],
        );
      } else if (event.eventType.startsWith("visit_intent.")) {
        await this.notifications.processVisitIntent(
          event.eventType,
          event.payload as Parameters<NotificationService["processVisitIntent"]>[1],
        );
      } else if (event.eventType.startsWith("health.")) {
        await this.notifications.processHealthFollowup(
          event.eventType,
          event.payload as Parameters<NotificationService["processHealthFollowup"]>[1],
        );
      } else if (event.eventType.startsWith("classified.")) {
        await this.notifications.processClassified(
          event.eventType,
          event.payload as Parameters<NotificationService["processClassified"]>[1],
        );
      }

      await this.db
        .update(outboxEvents)
        .set({ status: "PROCESSED", processedAt: new Date(), lastError: null })
        .where(eq(outboxEvents.id, eventId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(outboxEvents)
        .set({ status: "FAILED", lastError: message })
        .where(eq(outboxEvents.id, eventId));
      this.logger.warn(`Outbox event ${eventId} failed: ${message}`);
    }
  }
}
