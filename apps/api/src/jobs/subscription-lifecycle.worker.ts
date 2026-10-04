import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { runSubscriptionLifecycle, type PickiDb } from "@picki/db";
import { PICKI_DB } from "../shared/tokens.js";

const POLL_MS = 60_000;

@Injectable()
export class SubscriptionLifecycleWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubscriptionLifecycleWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

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
      const result = await runSubscriptionLifecycle(this.db);
      if (result.advanced > 0 || result.notices > 0) {
        this.logger.log(`Gói: ${String(result.advanced)} đổi trạng thái, ${String(result.notices)} nhắc mới`);
      }
    } catch (err) {
      this.logger.error("Subscription lifecycle failed", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }
}
