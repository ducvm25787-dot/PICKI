import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { authOtpChallenges, type PickiDb } from "@picki/db";
import { PickiError } from "@picki/shared";
import type { PickiConfig } from "../../shared/config.js";
import { generateOtpCode, hashOtp } from "../../shared/crypto.js";
import { PICKI_CONFIG, PICKI_DB } from "../../shared/tokens.js";

export type OtpRequestResult = {
  expiresAt: Date;
  devOtp?: string;
};

@Injectable()
export class OtpService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
  ) {}

  async requestPhoneOtp(destination: string): Promise<OtpRequestResult> {
    return this.createChallenge("PHONE", destination);
  }

  async requestEmailOtp(destination: string): Promise<OtpRequestResult> {
    return this.createChallenge("EMAIL", destination);
  }

  async verify(destination: string, code: string): Promise<void> {
    const codeHash = hashOtp(code, destination, this.config.sessionSecret);
    const now = new Date();

    const rows = await this.db
      .select()
      .from(authOtpChallenges)
      .where(
        and(
          eq(authOtpChallenges.destination, destination),
          eq(authOtpChallenges.codeHash, codeHash),
          gt(authOtpChallenges.expiresAt, now),
          isNull(authOtpChallenges.consumedAt),
        ),
      )
      .orderBy(desc(authOtpChallenges.createdAt))
      .limit(1);

    const challenge = rows[0];
    if (!challenge) {
      throw new PickiError("UNAUTHORIZED", "Invalid or expired OTP");
    }

    await this.db
      .update(authOtpChallenges)
      .set({ consumedAt: now })
      .where(eq(authOtpChallenges.id, challenge.id));
  }

  private async createChallenge(
    channel: "PHONE" | "EMAIL",
    destination: string,
  ): Promise<OtpRequestResult> {
    const code = generateOtpCode();
    const codeHash = hashOtp(code, destination, this.config.sessionSecret);
    const expiresAt = new Date(Date.now() + this.config.otpTtlMinutes * 60 * 1000);

    await this.db.insert(authOtpChallenges).values({
      channel,
      destination,
      codeHash,
      expiresAt,
    });

    return {
      expiresAt,
      devOtp: this.config.otpDevExpose ? code : undefined,
    };
  }
}
