import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { HealthFollowupsService } from "../modules/health/health-followups.service.js";

const POLL_MS = 60_000;
const BATCH = 20;

/** Nhắc tái khám đến hạn — đẩy sang outbox, OutboxWorker gửi thông báo cho khách. */
@Injectable()
export class HealthFollowupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthFollowupWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(HealthFollowupsService) private readonly followups: HealthFollowupsService,
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
      const sent = await this.followups.dispatchDue(BATCH);
      if (sent > 0) {
        this.logger.log(`Đã phát ${String(sent)} lời nhắc tái khám`);
      }
    } catch (err) {
      this.logger.error("Followup poll failed", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }
}
