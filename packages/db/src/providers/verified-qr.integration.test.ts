import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPickiDb } from "../client.js";
import { migrate } from "../migrator.js";
import { offerings } from "../schema/catalog.js";
import { userFavorites } from "../schema/discovery.js";
import { userIdentities, users } from "../schema/identity.js";
import { auditLogs } from "../schema/infrastructure.js";
import { providerMembers } from "../schema/provider-ops.js";
import { providerLocations, providers } from "../schema/providers.js";
import { userProviderRelationships } from "../schema/relationships.js";
import { syncRelationshipFavorite } from "../relationships/queries.js";
import {
  issueLocationQr,
  resolveVerifiedQr,
  setLocationVerification,
  VerifiedQrError,
} from "./verified-qr.js";

const databaseUrl = process.env.DATABASE_URL ?? "";

describe.skipIf(!databaseUrl)("verified location QR", () => {
  const { db, sql } = createPickiDb(databaseUrl);
  const slug = `vqr-${Date.now()}`;
  let adminId = "";
  let customerId = "";
  let providerId = "";
  let locationId = "";
  let staffId = "";
  let offeringId = "";
  let firstToken = "";
  let secondToken = "";

  beforeAll(async () => {
    await migrate({ databaseUrl });
    const [admin] = await db.insert(users).values({ displayName: `${slug}-ops` }).returning();
    const [customer] = await db.insert(users).values({ displayName: `${slug}-khach` }).returning();
    const [staff] = await db.insert(users).values({ displayName: `${slug}-quan` }).returning();
    const [provider] = await db
      .insert(providers)
      .values({
        slug,
        brandName: "Quán QR",
        providerType: "FOOD_STALL",
        commerceModel: "FOOD_SERVICE",
        status: "ACTIVE",
      })
      .returning();
    const [location] = await db
      .insert(providerLocations)
      .values({
        providerId: provider!.id,
        slug,
        displayName: "Cơ sở 1",
        status: "ACTIVE",
      })
      .returning();
    const [offering] = await db
      .insert(offerings)
      .values({ providerId: provider!.id, slug: "pho", name: "Phở" })
      .returning();
    await db.insert(userIdentities).values({
      userId: staff!.id,
      provider: "PHONE",
      externalUserId: "0900000001",
    });
    await db.insert(providerMembers).values({
      userId: staff!.id,
      providerId: provider!.id,
      providerLocationId: location!.id,
      role: "OWNER",
    });
    adminId = admin!.id;
    customerId = customer!.id;
    staffId = staff!.id;
    providerId = provider!.id;
    locationId = location!.id;
    offeringId = offering!.id;
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.entityId, locationId));
    await db.delete(userFavorites).where(eq(userFavorites.providerLocationId, locationId));
    await db.delete(userProviderRelationships).where(eq(userProviderRelationships.providerLocationId, locationId));
    await db.delete(offerings).where(eq(offerings.id, offeringId));
    await db.delete(providerMembers).where(eq(providerMembers.providerId, providerId));
    await db.delete(providerLocations).where(eq(providerLocations.id, locationId));
    await db.delete(providers).where(eq(providers.id, providerId));
    await db.delete(userIdentities).where(eq(userIdentities.userId, staffId));
    await db.delete(users).where(eq(users.id, customerId));
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(users).where(eq(users.id, staffId));
    await sql.end({ timeout: 5 });
  });

  it("verifies, issues, scans, and saves the existing favorite", async () => {
    await expect(
      db
        .update(providerLocations)
        .set({ verifiedQrToken: "not-yet" })
        .where(eq(providerLocations.id, locationId)),
    ).rejects.toThrow();

    await setLocationVerification(db, {
      locationId,
      status: "VERIFIED",
      note: "Đã đối chiếu cửa",
      actorUserId: adminId,
    });
    const issued = await issueLocationQr(db, {
      locationId,
      actorUserId: adminId,
      reason: "In sticker",
    });
    firstToken = issued.token;
    expect(await resolveVerifiedQr(db, issued.token)).toBe(locationId);

    await db.insert(userFavorites).values({ userId: customerId, providerLocationId: locationId });
    await syncRelationshipFavorite(sql, customerId, locationId, true);
    const [rel] = await db
      .select()
      .from(userProviderRelationships)
      .where(eq(userProviderRelationships.providerLocationId, locationId));
    expect(rel?.favorite).toBe(true);
  });

  it("keeps the active token when the shop changes name, menu, and phone", async () => {
    const [before] = await db
      .select({ token: providerLocations.verifiedQrToken })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    await db.update(providers).set({ brandName: "Quán QR mới" }).where(eq(providers.id, providerId));
    await db
      .update(providerLocations)
      .set({ displayName: "Cơ sở đổi tên" })
      .where(eq(providerLocations.id, locationId));
    await db.update(offerings).set({ name: "Phở gà" }).where(eq(offerings.id, offeringId));
    await db
      .update(userIdentities)
      .set({ externalUserId: "0900000099" })
      .where(eq(userIdentities.userId, staffId));

    const [after] = await db
      .select({ token: providerLocations.verifiedQrToken })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    expect(after?.token).toBe(before?.token);
    expect(await resolveVerifiedQr(db, before!.token!)).toBe(locationId);
  });

  it("makes the previous token miss after reissue", async () => {
    const [before] = await db
      .select({ token: providerLocations.verifiedQrToken })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    const next = await issueLocationQr(db, {
      locationId,
      actorUserId: adminId,
      reason: "Sticker bị copy",
    });
    secondToken = next.token;
    expect(next.reissued).toBe(true);
    expect(next.token).not.toBe(before?.token);
    expect(await resolveVerifiedQr(db, before!.token!)).toBeNull();
    expect(await resolveVerifiedQr(db, next.token)).toBe(locationId);
  });

  it("clears the token when the location leaves VERIFIED", async () => {
    const [before] = await db
      .select({ token: providerLocations.verifiedQrToken })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    const result = await setLocationVerification(db, {
      locationId,
      status: "REJECTED",
      note: "Không đúng cửa",
      actorUserId: adminId,
    });
    expect(result.clearedQr).toBe(true);
    const [row] = await db
      .select()
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    expect(row?.verificationStatus).toBe("REJECTED");
    expect(row?.verifiedQrToken).toBeNull();
    expect(row?.verifiedQrIssuedAt).toBeNull();
    expect(await resolveVerifiedQr(db, before!.token!)).toBeNull();
    await expect(
      issueLocationQr(db, { locationId, actorUserId: adminId }),
    ).rejects.toBeInstanceOf(VerifiedQrError);
  });

  it("writes audit actions without the token", async () => {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, locationId));
    const blob = JSON.stringify(logs);
    const [location] = await db
      .select({ token: providerLocations.verifiedQrToken })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId));
    expect(logs.map((row) => row.action).sort()).toEqual(
      ["LOCATION_VERIFICATION_SET", "LOCATION_VERIFICATION_SET", "QR_ISSUE", "QR_REISSUE"].sort(),
    );
    expect(blob).toContain("In sticker");
    expect(blob).not.toContain(firstToken);
    expect(blob).not.toContain(secondToken);
    for (const row of logs) {
      expect(JSON.stringify(row.metadata)).not.toMatch(/token/i);
    }
    if (location?.token) expect(blob).not.toContain(location.token);
  });
});