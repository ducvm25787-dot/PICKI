import { Inject, Injectable } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import {
  approveProviderCampaign,
  CampaignDenied,
  listCampaignHomeCards,
  providerCampaigns,
  providerCampaignSuppressions,
  providerCampaignTargets,
  providerLocations,
  providerZoneMemberships,
  providers,
  rejectProviderCampaign,
  suppressProviderCampaign,
  unsuppressProviderCampaign,
  zones,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { canApproveChainCampaign, canSuppressChainCampaign, PickiError, type AdminAccess } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";

function denied(error: unknown): never {
  if (error instanceof CampaignDenied) throw new PickiError("FORBIDDEN", error.message);
  throw error;
}

@Injectable()
export class CampaignAdminService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
  ) {}

  async queue(access: AdminAccess) {
    if (!canApproveChainCampaign(access)) throw new PickiError("FORBIDDEN", "Chỉ Pickee trung tâm duyệt chương trình chuỗi");
    const rows = await this.db
      .select({
        id: providerCampaigns.id,
        name: providerCampaigns.name,
        campaignType: providerCampaigns.campaignType,
        startsAt: providerCampaigns.startsAt,
        endsAt: providerCampaigns.endsAt,
        status: providerCampaigns.status,
        approvalStatus: providerCampaigns.approvalStatus,
        brandName: providers.brandName,
      })
      .from(providerCampaigns)
      .innerJoin(providers, eq(providers.id, providerCampaigns.providerId))
      .where(eq(providerCampaigns.status, "SUBMITTED"));
    return {
      campaigns: rows.map((row) => ({
        ...row,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
      })),
    };
  }

  async approve(access: AdminAccess, userId: string, campaignId: string) {
    if (!canApproveChainCampaign(access)) throw new PickiError("FORBIDDEN", "Zone không duyệt chương trình chuỗi");
    try {
      await approveProviderCampaign(this.db, { actorUserId: userId, campaignId });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  async reject(access: AdminAccess, userId: string, campaignId: string, reason: string) {
    if (!canApproveChainCampaign(access)) throw new PickiError("FORBIDDEN", "Zone không từ chối chương trình chuỗi");
    try {
      await rejectProviderCampaign(this.db, { actorUserId: userId, campaignId, reason });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  async zoneBoard(access: AdminAccess, zoneId: string) {
    if (!canSuppressChainCampaign(access, zoneId) && !access.superAdmin && access.zones[zoneId] == null) {
      throw new PickiError("FORBIDDEN", "Không xem được chương trình của Zone này");
    }
    const running = await listCampaignHomeCards(this.sql, zoneId);
    const hidden = await this.db
      .select({
        id: providerCampaignSuppressions.id,
        campaignId: providerCampaignSuppressions.campaignId,
        locationId: providerCampaignSuppressions.providerLocationId,
        reason: providerCampaignSuppressions.reason,
        name: providerCampaigns.name,
        brandName: providers.brandName,
      })
      .from(providerCampaignSuppressions)
      .innerJoin(providerCampaigns, eq(providerCampaigns.id, providerCampaignSuppressions.campaignId))
      .innerJoin(providers, eq(providers.id, providerCampaigns.providerId))
      .where(and(eq(providerCampaignSuppressions.zoneId, zoneId), isNull(providerCampaignSuppressions.liftedAt)));
    return {
      running: running.map((card) => ({
        campaignId: card.campaign_id,
        name: card.title,
        brandName: card.brand_name,
        locationId: card.location_id,
        locationName: card.location_name,
        providerType: card.provider_type,
      })),
      suppressed: hidden,
    };
  }

  async suppress(
    access: AdminAccess,
    userId: string,
    zoneId: string,
    campaignId: string,
    reason: string,
    locationId?: string | null,
  ) {
    if (!canSuppressChainCampaign(access, zoneId)) throw new PickiError("FORBIDDEN", "Chỉ ẩn chương trình trong Zone mình quản");
    const allowed = await this.targetsZone(campaignId, zoneId, locationId);
    if (!allowed) throw new PickiError("FORBIDDEN", "Chương trình không chạy ở Zone này");
    try {
      await suppressProviderCampaign(this.db, { actorUserId: userId, campaignId, zoneId, locationId, reason });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  async unsuppress(access: AdminAccess, userId: string, zoneId: string, campaignId: string, locationId?: string | null) {
    if (!canSuppressChainCampaign(access, zoneId)) throw new PickiError("FORBIDDEN", "Chỉ mở lại chương trình trong Zone mình quản");
    try {
      await unsuppressProviderCampaign(this.db, { actorUserId: userId, campaignId, zoneId, locationId });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  private async targetsZone(campaignId: string, zoneId: string, locationId?: string | null) {
    const [zone] = await this.db.select({ cityId: zones.cityId }).from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!zone) return false;
    const [campaign] = await this.db.select().from(providerCampaigns).where(eq(providerCampaigns.id, campaignId)).limit(1);
    if (!campaign) return false;
    const targets = await this.db.select().from(providerCampaignTargets).where(eq(providerCampaignTargets.campaignId, campaignId));
    const memberships = await this.db
      .select({ locationId: providerZoneMemberships.providerLocationId, providerId: providerLocations.providerId })
      .from(providerZoneMemberships)
      .innerJoin(providerLocations, eq(providerLocations.id, providerZoneMemberships.providerLocationId))
      .where(and(eq(providerZoneMemberships.zoneId, zoneId), eq(providerZoneMemberships.status, "ACTIVE")));
    if (locationId && !memberships.some((row) => row.locationId === locationId && row.providerId === campaign.providerId)) return false;
    return targets.some((target) => {
      if (target.targetType === "PROVIDER") return memberships.some((row) => row.providerId === campaign.providerId);
      if (target.targetType === "CITY") return target.targetId === zone.cityId;
      if (target.targetType === "ZONE") return target.targetId === zoneId;
      return memberships.some((row) => row.locationId === target.targetId);
    });
  }
}
