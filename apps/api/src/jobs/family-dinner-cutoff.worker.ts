import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { FamilyDinnerService } from "../modules/family-dinner/family-dinner.service.js";

const POLL_MS = 60_000;

/** Auto-lock Family Dinner production after provider cutoff. */
@Injectable()
export class FamilyDinnerCutoffWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FamilyDinnerCutoffWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(@Inject(FamilyDinnerService) private readonly dinner: FamilyDinnerService) {}

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
      const locked = await this.dinner.lockProductionDue();
      if (locked > 0) {
        this.logger.log(`Đã chốt ${String(locked)} batch Family Dinner sau cutoff`);
      }
    } catch (err) {
      this.logger.error("Family Dinner cutoff poll failed", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }
}
