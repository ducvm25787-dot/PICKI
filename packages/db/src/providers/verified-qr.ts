import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { auditLogs } from "../schema/infrastructure.js";
import { providerLocations } from "../schema/providers.js";

export const LOCATION_VERIFICATION_STATUSES = [
  "UNVERIFIED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;

export type LocationVerificationStatus = (typeof LOCATION_VERIFICATION_STATUSES)[number];

export class VerifiedQrError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "VerifiedQrError";
  }
}

export function newVerifiedQrToken(): string {
  return randomBytes(16).toString("base64url");
}

export async function setLocationVerification(
  db: PickiDb,
  input: {
    locationId: string;
    status: LocationVerificationStatus;
    note?: string | null;
    actorUserId: string;
    zoneId?: string | null;
  },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, input.locationId))
      .limit(1);
    if (!row) throw new VerifiedQrError("NOT_FOUND", "Không tìm thấy cơ sở");

    const leavingVerified = row.verificationStatus === "VERIFIED" && input.status !== "VERIFIED";
    const hadToken = !!row.verifiedQrToken;

    await tx
      .update(providerLocations)
      .set({
        verificationStatus: input.status,
        verificationNote: input.note?.trim() || null,
        verifiedAt: input.status === "VERIFIED" ? new Date() : row.verifiedAt,
        verifiedBy: input.status === "VERIFIED" ? input.actorUserId : row.verifiedBy,
        verifiedQrToken: input.status === "VERIFIED" ? row.verifiedQrToken : null,
        verifiedQrIssuedAt: input.status === "VERIFIED" ? row.verifiedQrIssuedAt : null,
        updatedAt: new Date(),
      })
      .where(eq(providerLocations.id, input.locationId));

    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: "LOCATION_VERIFICATION_SET",
      entityType: "provider_location",
      entityId: input.locationId,
      zoneId: input.zoneId ?? null,
      metadata: {
        status: input.status,
        reason: input.note?.trim() || null,
        clearedQr: leavingVerified && hadToken,
      },
    });

    return { locationId: input.locationId, status: input.status, clearedQr: leavingVerified && hadToken };
  });
}

export async function issueLocationQr(
  db: PickiDb,
  input: { locationId: string; actorUserId: string; reason?: string | null; zoneId?: string | null },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, input.locationId))
      .limit(1);
    if (!row) throw new VerifiedQrError("NOT_FOUND", "Không tìm thấy cơ sở");
    if (row.verificationStatus !== "VERIFIED") {
      throw new VerifiedQrError("CONFLICT", "Chỉ cơ sở đã xác minh mới được cấp QR");
    }

    const token = newVerifiedQrToken();
    const reissued = !!row.verifiedQrToken;
    await tx
      .update(providerLocations)
      .set({
        verifiedQrToken: token,
        verifiedQrIssuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(providerLocations.id, input.locationId));

    await tx.insert(auditLogs).values({
      actorUserId: input.actorUserId,
      action: reissued ? "QR_REISSUE" : "QR_ISSUE",
      entityType: "provider_location",
      entityId: input.locationId,
      zoneId: input.zoneId ?? null,
      metadata: { reason: input.reason?.trim() || null },
    });

    return { locationId: input.locationId, token, reissued };
  });
}

export async function resolveVerifiedQr(db: PickiDb, token: string): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const [row] = await db
    .select({ id: providerLocations.id })
    .from(providerLocations)
    .where(
      and(
        eq(providerLocations.verifiedQrToken, trimmed),
        eq(providerLocations.verificationStatus, "VERIFIED"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
