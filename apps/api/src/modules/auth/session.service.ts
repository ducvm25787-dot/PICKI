import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import { authSessions, type PickiDb } from "@picki/db";
import type { PickiConfig } from "../../shared/config.js";
import { generateSessionToken, sha256 } from "../../shared/crypto.js";
import { PICKI_CONFIG, PICKI_DB } from "../../shared/tokens.js";

@Injectable()
export class SessionService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
  ) {}

  async create(userId: string): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const tokenHash = sha256(token);
    const expiresAt = new Date(
      Date.now() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.db.insert(authSessions).values({
      userId,
      tokenHash,
      expiresAt,
    });

    return { token, expiresAt };
  }

  async resolveUserId(token: string): Promise<string | null> {
    const tokenHash = sha256(token);
    const now = new Date();
    const rows = await this.db
      .select({ userId: authSessions.userId })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          gt(authSessions.expiresAt, now),
          isNull(authSessions.revokedAt),
        ),
      )
      .limit(1);

    return rows[0]?.userId ?? null;
  }

  async revoke(token: string): Promise<void> {
    const tokenHash = sha256(token);
    await this.db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(eq(authSessions.tokenHash, tokenHash));
  }
}
