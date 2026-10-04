import { and, eq, inArray, isNull } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { offerings } from "../schema/catalog.js";
import { auditLogs } from "../schema/infrastructure.js";
import {
  orderCampaignAttributions,
  providerCampaignItems,
  providerCampaigns,
  providerCampaignSuppressions,
  providerCampaignTargets,
} from "../schema/campaigns.js";
import type { ChainGrant, ChainLocation } from "./chain-scope.js";
import {
  campaignDisplayStatus,
  canCreateChainCampaign,
  canTargetCampaign,
  materialEditReturnsToDraft,
  resolveCampaignLocations,
  type CampaignStoredStatus,
  type CampaignTarget,
  type CampaignType,
} from "./campaign-rules.js";

export class CampaignDenied extends Error {}

type ItemInput = {
  offeringId: string | null;
  campaignPrice?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  heroPriority?: number | null;
};

async function audit(
  db: PickiDb,
  input: {
    actorUserId: string;
    action: string;
    campaignId: string;
    zoneId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(auditLogs).values({
    actorUserId: input.actorUserId,
    action: input.action,
    entityType: "provider_campaign",
    entityId: input.campaignId,
    zoneId: input.zoneId ?? null,
    metadata: input.metadata ?? {},
  });
}

async function assertOfferings(db: PickiDb, providerId: string, items: readonly ItemInput[]) {
  const ids = items.flatMap((item) => (item.offeringId ? [item.offeringId] : []));
  if (ids.length === 0) return;
  const rows = await db
    .select({ id: offerings.id })
    .from(offerings)
    .where(and(eq(offerings.providerId, providerId), inArray(offerings.id, ids)));
  if (rows.length !== new Set(ids).size) throw new CampaignDenied("Sản phẩm không thuộc chuỗi này");
}

function assertTargets(input: {
  grants: readonly ChainGrant[];
  providerId: string;
  providerLocationCount: number;
  locations: readonly ChainLocation[];
  targets: readonly CampaignTarget[];
}) {
  if (!canCreateChainCampaign(input)) throw new CampaignDenied("Phạm vi này không tạo chương trình chuỗi");
  if (input.targets.length === 0) throw new CampaignDenied("Chọn phạm vi chương trình");
  for (const target of input.targets) {
    if (!canTargetCampaign({ ...input, target })) throw new CampaignDenied("Phạm vi mục tiêu nằm ngoài quyền");
  }
}

export async function createProviderCampaign(
  db: PickiDb,
  input: {
    actorUserId: string;
    providerId: string;
    grants: readonly ChainGrant[];
    locations: readonly ChainLocation[];
    providerLocationCount: number;
    name: string;
    description?: string | null;
    campaignType: CampaignType;
    startsAt: Date;
    endsAt: Date;
    targets: readonly CampaignTarget[];
    items: readonly ItemInput[];
  },
) {
  assertTargets(input);
  if (input.endsAt <= input.startsAt) throw new CampaignDenied("Thời gian kết thúc phải sau lúc bắt đầu");
  await assertOfferings(db, input.providerId, input.items);
  const [created] = await db
    .insert(providerCampaigns)
    .values({
      providerId: input.providerId,
      name: input.name,
      description: input.description ?? null,
      campaignType: input.campaignType,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      status: "DRAFT",
      approvalStatus: "NONE",
      createdBy: input.actorUserId,
    })
    .returning();
  if (!created) throw new CampaignDenied("Không tạo được chương trình");
  if (input.targets.length > 0) {
    await db.insert(providerCampaignTargets).values(
      input.targets.map((target) => ({
        campaignId: created.id,
        targetType: target.targetType,
        targetId: target.targetId,
      })),
    );
  }
  if (input.items.length > 0) {
    await db.insert(providerCampaignItems).values(
      input.items.map((item) => ({
        campaignId: created.id,
        offeringId: item.offeringId,
        campaignPrice: item.campaignPrice ?? null,
        discountAmount: item.discountAmount ?? null,
        discountPercent: item.discountPercent ?? null,
        heroPriority: item.heroPriority ?? null,
      })),
    );
  }
  await audit(db, { actorUserId: input.actorUserId, action: "campaign.created", campaignId: created.id });
  return created;
}

async function loadOwned(db: PickiDb, campaignId: string, providerId: string) {
  const [row] = await db
    .select()
    .from(providerCampaigns)
    .where(and(eq(providerCampaigns.id, campaignId), eq(providerCampaigns.providerId, providerId)))
    .limit(1);
  if (!row) throw new CampaignDenied("Không thấy chương trình");
  return row;
}

export async function submitProviderCampaign(
  db: PickiDb,
  input: { actorUserId: string; providerId: string; campaignId: string; grants: readonly ChainGrant[]; providerLocationCount: number },
) {
  if (!canCreateChainCampaign(input)) throw new CampaignDenied("Phạm vi này không gửi duyệt chương trình chuỗi");
  const row = await loadOwned(db, input.campaignId, input.providerId);
  if (row.status !== "DRAFT") throw new CampaignDenied("Chỉ bản nháp mới gửi duyệt");
  await db
    .update(providerCampaigns)
    .set({ status: "SUBMITTED", approvalStatus: "PENDING", updatedAt: new Date() })
    .where(eq(providerCampaigns.id, row.id));
  await audit(db, { actorUserId: input.actorUserId, action: "campaign.submitted", campaignId: row.id });
}

export async function editProviderCampaign(
  db: PickiDb,
  input: {
    actorUserId: string;
    providerId: string;
    campaignId: string;
    grants: readonly ChainGrant[];
    locations: readonly ChainLocation[];
    providerLocationCount: number;
    name?: string;
    description?: string | null;
    startsAt?: Date;
    endsAt?: Date;
    targets?: readonly CampaignTarget[];
    items?: readonly ItemInput[];
  },
) {
  if (!canCreateChainCampaign(input)) throw new CampaignDenied("Phạm vi này không sửa chương trình chuỗi");
  const row = await loadOwned(db, input.campaignId, input.providerId);
  const status = row.status as CampaignStoredStatus;
  const invalidate = materialEditReturnsToDraft(status);
  if (input.targets) {
    assertTargets({ ...input, targets: input.targets });
    await db.delete(providerCampaignTargets).where(eq(providerCampaignTargets.campaignId, row.id));
    await db.insert(providerCampaignTargets).values(
      input.targets.map((target) => ({ campaignId: row.id, targetType: target.targetType, targetId: target.targetId })),
    );
  }
  if (input.items) {
    await assertOfferings(db, input.providerId, input.items);
    await db.delete(providerCampaignItems).where(eq(providerCampaignItems.campaignId, row.id));
    if (input.items.length > 0) {
      await db.insert(providerCampaignItems).values(
        input.items.map((item) => ({
          campaignId: row.id,
          offeringId: item.offeringId,
          campaignPrice: item.campaignPrice ?? null,
          discountAmount: item.discountAmount ?? null,
          discountPercent: item.discountPercent ?? null,
          heroPriority: item.heroPriority ?? null,
        })),
      );
    }
  }
  await db
    .update(providerCampaigns)
    .set({
      name: input.name ?? row.name,
      description: input.description === undefined ? row.description : input.description,
      startsAt: input.startsAt ?? row.startsAt,
      endsAt: input.endsAt ?? row.endsAt,
      status: invalidate ? "DRAFT" : row.status,
      approvalStatus: invalidate ? "NONE" : row.approvalStatus,
      approvedBy: invalidate ? null : row.approvedBy,
      approvedAt: invalidate ? null : row.approvedAt,
      contentRevision: invalidate ? row.contentRevision + 1 : row.contentRevision,
      updatedAt: new Date(),
    })
    .where(eq(providerCampaigns.id, row.id));
  await audit(db, {
    actorUserId: input.actorUserId,
    action: "campaign.edited",
    campaignId: row.id,
    metadata: { invalidatedApproval: invalidate },
  });
}

export async function approveProviderCampaign(db: PickiDb, input: { actorUserId: string; campaignId: string }) {
  const [row] = await db.select().from(providerCampaigns).where(eq(providerCampaigns.id, input.campaignId)).limit(1);
  if (!row || row.status !== "SUBMITTED") throw new CampaignDenied("Chỉ chương trình đang chờ mới được duyệt");
  const targets = await db.select().from(providerCampaignTargets).where(eq(providerCampaignTargets.campaignId, row.id));
  const items = await db.select().from(providerCampaignItems).where(eq(providerCampaignItems.campaignId, row.id));
  const approvedAt = new Date();
  await db
    .update(providerCampaigns)
    .set({
      status: "APPROVED",
      approvalStatus: "APPROVED",
      approvedRevision: row.contentRevision,
      approvedBy: input.actorUserId,
      approvedAt,
      approvedSnapshot: {
        name: row.name,
        description: row.description,
        campaignType: row.campaignType,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        targets: targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId })),
        items: items.map((item) => ({
          offeringId: item.offeringId,
          campaignPrice: item.campaignPrice,
          discountAmount: item.discountAmount,
          discountPercent: item.discountPercent,
          heroPriority: item.heroPriority,
        })),
      },
      updatedAt: approvedAt,
    })
    .where(eq(providerCampaigns.id, row.id));
  await audit(db, {
    actorUserId: input.actorUserId,
    action: "campaign.approved",
    campaignId: row.id,
    zoneId: null,
    metadata: { scope: "GLOBAL" },
  });
}

export async function rejectProviderCampaign(
  db: PickiDb,
  input: { actorUserId: string; campaignId: string; reason: string },
) {
  const [row] = await db.select().from(providerCampaigns).where(eq(providerCampaigns.id, input.campaignId)).limit(1);
  if (!row || row.status !== "SUBMITTED") throw new CampaignDenied("Chỉ chương trình đang chờ mới được từ chối");
  await db
    .update(providerCampaigns)
    .set({
      status: "REJECTED",
      approvalStatus: "REJECTED",
      rejectionReason: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(providerCampaigns.id, row.id));
  await audit(db, {
    actorUserId: input.actorUserId,
    action: "campaign.rejected",
    campaignId: row.id,
    zoneId: null,
    metadata: { scope: "GLOBAL", reason: input.reason },
  });
}

export async function pauseProviderCampaign(
  db: PickiDb,
  input: { actorUserId: string; providerId: string; campaignId: string; grants: readonly ChainGrant[]; providerLocationCount: number; resume?: boolean },
) {
  if (!canCreateChainCampaign(input)) throw new CampaignDenied("Không có quyền tạm dừng chương trình");
  const row = await loadOwned(db, input.campaignId, input.providerId);
  const next = input.resume ? "APPROVED" : "PAUSED";
  if (!input.resume && row.status !== "APPROVED") throw new CampaignDenied("Chỉ chương trình đã duyệt mới tạm dừng");
  if (input.resume && row.status !== "PAUSED") throw new CampaignDenied("Chương trình không đang tạm dừng");
  if (input.resume && row.approvedRevision !== row.contentRevision) throw new CampaignDenied("Cần gửi duyệt lại");
  await db.update(providerCampaigns).set({ status: next, updatedAt: new Date() }).where(eq(providerCampaigns.id, row.id));
  await audit(db, { actorUserId: input.actorUserId, action: "campaign.paused", campaignId: row.id, metadata: { resume: input.resume === true } });
}

export async function suppressProviderCampaign(
  db: PickiDb,
  input: { actorUserId: string; campaignId: string; zoneId: string; locationId?: string | null; reason: string },
) {
  if (!input.reason.trim()) throw new CampaignDenied("Cần lý do ẩn");
  const [campaign] = await db.select().from(providerCampaigns).where(eq(providerCampaigns.id, input.campaignId)).limit(1);
  if (!campaign || campaign.status !== "APPROVED") throw new CampaignDenied("Chỉ ẩn chương trình đang được duyệt");
  await db.insert(providerCampaignSuppressions).values({
    campaignId: input.campaignId,
    zoneId: input.zoneId,
    providerLocationId: input.locationId ?? null,
    suppressedBy: input.actorUserId,
    reason: input.reason.trim(),
  });
  await audit(db, {
    actorUserId: input.actorUserId,
    action: "campaign.suppressed",
    campaignId: input.campaignId,
    zoneId: input.zoneId,
    metadata: { locationId: input.locationId ?? null, reason: input.reason.trim() },
  });
}

export async function unsuppressProviderCampaign(
  db: PickiDb,
  input: { actorUserId: string; campaignId: string; zoneId: string; locationId?: string | null },
) {
  const rows = await db
    .select()
    .from(providerCampaignSuppressions)
    .where(
      and(
        eq(providerCampaignSuppressions.campaignId, input.campaignId),
        eq(providerCampaignSuppressions.zoneId, input.zoneId),
        isNull(providerCampaignSuppressions.liftedAt),
      ),
    );
  const match = rows.find((row) => (input.locationId ? row.providerLocationId === input.locationId : row.providerLocationId == null));
  if (!match) throw new CampaignDenied("Không thấy lượt ẩn");
  await db
    .update(providerCampaignSuppressions)
    .set({ liftedAt: new Date() })
    .where(eq(providerCampaignSuppressions.id, match.id));
  await audit(db, {
    actorUserId: input.actorUserId,
    action: "campaign.unsuppressed",
    campaignId: input.campaignId,
    zoneId: input.zoneId,
    metadata: { locationId: input.locationId ?? null },
  });
}

export async function listProviderCampaigns(
  db: PickiDb,
  input: {
    providerId: string;
    locations: readonly ChainLocation[];
    now?: Date;
  },
) {
  const rows = await db.select().from(providerCampaigns).where(eq(providerCampaigns.providerId, input.providerId));
  const ids = rows.map((row) => row.id);
  const targets = ids.length
    ? await db.select().from(providerCampaignTargets).where(inArray(providerCampaignTargets.campaignId, ids))
    : [];
  const now = input.now ?? new Date();
  const visibleIds = new Set(input.locations.map((location) => location.id));
  return rows.flatMap((row) => {
    const ownTargets = targets
      .filter((target) => target.campaignId === row.id)
      .map((target) => ({ targetType: target.targetType as CampaignTarget["targetType"], targetId: target.targetId }));
    const resolved = resolveCampaignLocations(input.providerId, ownTargets, input.locations);
    if (!resolved.some((location) => visibleIds.has(location.id))) return [];
    return [{
      id: row.id,
      name: row.name,
      campaignType: row.campaignType,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      status: campaignDisplayStatus({
        status: row.status as CampaignStoredStatus,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        now,
      }),
      approvalStatus: row.approvalStatus,
      targets: ownTargets,
    }];
  });
}

export async function recordOrderCampaignAttributions(
  db: PickiDb,
  rows: readonly {
    orderId: string;
    campaignId: string;
    providerLocationId: string | null;
    offeringId: string | null;
    attributionKind: CampaignType;
    campaignPrice: number | null;
    discountAmount: number | null;
    discountPercent: number | null;
    snapshot: Record<string, unknown>;
  }[],
) {
  if (rows.length === 0) return;
  await db.insert(orderCampaignAttributions).values(rows.map((row) => ({ ...row })));
}
