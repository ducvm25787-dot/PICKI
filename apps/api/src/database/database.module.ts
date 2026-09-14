import { Global, Module, type OnModuleDestroy, Inject } from "@nestjs/common";
import { createPickiDb } from "@picki/db";
import { loadConfig, type PickiConfig } from "../shared/config.js";
import {
  PICKI_CONFIG,
  PICKI_CONNECTION,
  PICKI_DB,
  PICKI_SQL,
} from "../shared/tokens.js";

export type PickiConnection = ReturnType<typeof createPickiDb>;

@Global()
@Module({
  providers: [
    {
      provide: PICKI_CONFIG,
      useFactory: (): PickiConfig => loadConfig(),
    },
    {
      provide: PICKI_CONNECTION,
      inject: [PICKI_CONFIG],
      useFactory: (config: PickiConfig): PickiConnection =>
        createPickiDb(config.databaseUrl),
    },
    {
      provide: PICKI_DB,
      inject: [PICKI_CONNECTION],
      useFactory: (conn: PickiConnection) => conn.db,
    },
    {
      provide: PICKI_SQL,
      inject: [PICKI_CONNECTION],
      useFactory: (conn: PickiConnection) => conn.sql,
    },
  ],
  exports: [PICKI_CONFIG, PICKI_CONNECTION, PICKI_DB, PICKI_SQL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PICKI_CONNECTION) private readonly connection: PickiConnection) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.sql.end({ timeout: 5 });
  }
}
