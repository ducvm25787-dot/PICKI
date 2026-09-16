import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ClassifiedsService } from "../modules/classifieds/classifieds.service.js";

const POLL_MS = 60_000;
const BATCH = 20;

/** Auto-archive tin housing / thất lạc hết TTL. */
@Injectable()
export class HousingExpireWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HousingExpireWorker.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(@Inject(ClassifiedsService) private readonly classifieds: ClassifiedsService) {}

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
      const expired = await this.classifieds.expireDueHousing(BATCH);
      if (expired > 0) {
        this.logger.log(`Đã ẩn ${String(expired)} tin peer hết hạn (housing/thất lạc)`);
      }
    } catch (err) {
      this.logger.error("TTL expire poll failed", err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }
}
