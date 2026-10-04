import { Inject, Injectable } from "@nestjs/common";
import {
  CampaignDenied,
  canCreateChainCampaign,
  createProviderCampaign,
  editProviderCampaign,
  listProviderCampaigns,
  loadChainViewer,
  pauseProviderCampaign,
  resolveChainScope,
  submitProviderCampaign,
  type CampaignType,
  type ChainScopeType,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";

function denied(error: unknown): never {
  if (error instanceof CampaignDenied) throw new PickiError("FORBIDDEN", error.message);
  throw error;
}

@Injectable()
export class CampaignService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async list(userId: string, scopeType?: string, scopeId?: string, status?: string) {
    const viewer = await loadChainViewer(this.db, userId);
    const { scope, locations } = this.scoped(viewer, scopeType, scopeId);
    const providerId = locations[0]?.providerId;
    if (!providerId) return { scope, campaigns: [] };
    const campaigns = await listProviderCampaigns(this.db, { providerId, locations });
    return {
      scope,
      campaigns: status ? campaigns.filter((campaign) => campaign.status === status) : campaigns,
    };
  }

  async create(
    userId: string,
    body: {
      name: string;
      description?: string | null;
      campaignType: CampaignType;
      startsAt: string;
      endsAt: string;
      targets: { targetType: ChainScopeType; targetId: string }[];
      items: {
        offeringId: string | null;
        campaignPrice?: number | null;
        discountAmount?: number | null;
        discountPercent?: number | null;
        heroPriority?: number | null;
      }[];
      submit?: boolean;
    },
    scopeType?: string,
    scopeId?: string,
  ) {
    const viewer = await loadChainViewer(this.db, userId);
    const { locations } = this.scoped(viewer, scopeType, scopeId);
    const providerId = locations[0]?.providerId;
    if (!providerId) throw new PickiError("FORBIDDEN", "Không có điểm bán trong phạm vi này");
    try {
      const created = await createProviderCampaign(this.db, {
        actorUserId: userId,
        providerId,
        grants: viewer.grants,
        locations: viewer.locations,
        providerLocationCount: viewer.locations.length,
        name: body.name,
        description: body.description,
        campaignType: body.campaignType,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        targets: body.targets,
        items: body.items,
      });
      if (body.submit) {
        await submitProviderCampaign(this.db, {
          actorUserId: userId,
          providerId,
          campaignId: created.id,
          grants: viewer.grants,
          providerLocationCount: viewer.locations.length,
        });
      }
      return { id: created.id };
    } catch (error) {
      denied(error);
    }
  }

  async edit(
    userId: string,
    campaignId: string,
    body: { name?: string; description?: string | null },
  ) {
    const viewer = await loadChainViewer(this.db, userId);
    const providerId = viewer.locations[0]?.providerId;
    if (!providerId) throw new PickiError("FORBIDDEN", "Không có quyền sửa chương trình");
    try {
      await editProviderCampaign(this.db, {
        actorUserId: userId,
        providerId,
        campaignId,
        grants: viewer.grants,
        locations: viewer.locations,
        providerLocationCount: viewer.locations.length,
        name: body.name,
        description: body.description,
      });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  async submit(userId: string, campaignId: string) {
    const viewer = await loadChainViewer(this.db, userId);
    const providerId = viewer.locations[0]?.providerId;
    if (!providerId) throw new PickiError("FORBIDDEN", "Không có quyền gửi duyệt");
    try {
      await submitProviderCampaign(this.db, {
        actorUserId: userId,
        providerId,
        campaignId,
        grants: viewer.grants,
        providerLocationCount: viewer.locations.length,
      });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  async pause(userId: string, campaignId: string, resume: boolean) {
    const viewer = await loadChainViewer(this.db, userId);
    const providerId = viewer.locations[0]?.providerId;
    if (!providerId) throw new PickiError("FORBIDDEN", "Không có quyền tạm dừng");
    try {
      await pauseProviderCampaign(this.db, {
        actorUserId: userId,
        providerId,
        campaignId,
        grants: viewer.grants,
        providerLocationCount: viewer.locations.length,
        resume,
      });
      return { id: campaignId };
    } catch (error) {
      denied(error);
    }
  }

  private scoped(viewer: Awaited<ReturnType<typeof loadChainViewer>>, scopeType?: string, scopeId?: string) {
    if (!canCreateChainCampaign({ grants: viewer.grants, providerLocationCount: viewer.locations.length })) {
      throw new PickiError("FORBIDDEN", "Phạm vi này không tạo chương trình chuỗi");
    }
    if (scopeType && scopeId && !viewer.scopes.some((choice) => choice.scopeType === scopeType && choice.scopeId === scopeId)) {
      throw new PickiError("FORBIDDEN", "Không có quyền ở phạm vi này");
    }
    const resolved = resolveChainScope(
      viewer,
      scopeType && scopeId ? { scopeType: scopeType as ChainScopeType, scopeId } : undefined,
    );
    if (!resolved.scope.scopeId) throw new PickiError("FORBIDDEN", "Không có quyền ở phạm vi này");
    return resolved;
  }
}
