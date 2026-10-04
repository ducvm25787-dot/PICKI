import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import {
  applyDailyStockAction,
  canCreateChainCampaign,
  canGrantMember,
  chainLocationRows,
  chainOrders,
  chainOverview,
  chainProductLocations,
  chainProducts,
  chainToday,
  loadChainViewer,
  locationsCoveredByGrants,
  locationsInScope,
  offerings,
  offeringPrices,
  providerMembers,
  resolveChainScope,
  setDailySellableQty,
  userIdentities,
  users,
  viewerCanEditCatalog,
  type ChainScopeType,
  type ChainViewer,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { normalizePhone } from "../../shared/crypto.js";
import { PICKI_DB } from "../../shared/tokens.js";

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${base || "mon"}-${Date.now().toString(36)}`;
}

@Injectable()
export class ChainConsoleService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async access(userId: string) {
    const viewer = await loadChainViewer(this.db, userId);
    const scope = viewer.scopes[0] ?? null;
    return {
      chainEnabled: viewer.chainEnabled,
      canManageMembers: viewer.canManageMembers,
      canManageCampaigns: canCreateChainCampaign({
        grants: viewer.grants,
        providerLocationCount: viewer.locations.length,
      }),
      canEditCatalog: viewer.grants.some((grant) => viewerCanEditCatalog(viewer, grant.providerId)),
      brandName: viewer.locations[0]?.brandName ?? "",
      scope,
      scopes: viewer.scopes,
    };
  }

  async overview(userId: string, scopeType?: string, scopeId?: string) {
    const { scope, locations } = await this.scoped(userId, scopeType, scopeId);
    const metrics = await chainOverview(this.db, locations, scope);
    return { scope, ...metrics };
  }

  async locations(userId: string, scopeType?: string, scopeId?: string) {
    const { scope, locations } = await this.scoped(userId, scopeType, scopeId);
    return { scope, locations: await chainLocationRows(this.db, locations, scope) };
  }

  async orders(
    userId: string,
    scopeType: string | undefined,
    scopeId: string | undefined,
    filter: { range?: string; status?: string; locationId?: string; vertical?: string },
  ) {
    const { scope, locations } = await this.scoped(userId, scopeType, scopeId);
    const range = filter.range === "7d" ? "7d" : "today";
    if (filter.locationId && !locations.some((location) => location.id === filter.locationId)) {
      throw new PickiError("FORBIDDEN", "Điểm bán không thuộc phạm vi này");
    }
    return {
      scope,
      orders: await chainOrders(this.db, locations, scope, {
        range,
        status: filter.status || undefined,
        locationId: filter.locationId || undefined,
        vertical: filter.vertical || undefined,
      }),
    };
  }

  async products(userId: string, scopeType?: string, scopeId?: string) {
    const { scope, locations } = await this.scoped(userId, scopeType, scopeId);
    return { scope, products: await chainProducts(this.db, locations) };
  }

  async product(userId: string, offeringId: string, scopeType?: string, scopeId?: string) {
    const { scope, locations, viewer } = await this.scoped(userId, scopeType, scopeId);
    const rows = await chainProducts(this.db, locations);
    const product = rows.find((row) => row.id === offeringId);
    if (!product) throw new PickiError("NOT_FOUND", "Không thấy sản phẩm");
    return {
      scope,
      product,
      canEditCatalog: viewerCanEditCatalog(viewer, product.providerId),
      locations: await chainProductLocations(this.db, locations, offeringId),
    };
  }

  async createProduct(
    userId: string,
    input: { name: string; description?: string; imageUrl?: string },
    scopeType?: string,
    scopeId?: string,
  ) {
    const { locations, viewer } = await this.scoped(userId, scopeType, scopeId);
    const providerId = locations[0]?.providerId;
    if (!providerId || !viewerCanEditCatalog(viewer, providerId)) {
      throw new PickiError("FORBIDDEN", "Chỉ quản lý toàn hệ thống được tạo sản phẩm chung");
    }
    const [created] = await this.db
      .insert(offerings)
      .values({
        providerId,
        slug: slugify(input.name),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        imageUrl: input.imageUrl?.trim() || null,
        status: "ACTIVE",
      })
      .returning({ id: offerings.id });
    return { id: created!.id };
  }

  async updateProduct(
    userId: string,
    offeringId: string,
    input: { name?: string; description?: string; imageUrl?: string },
    scopeType?: string,
    scopeId?: string,
  ) {
    const { viewer } = await this.scoped(userId, scopeType, scopeId);
    const [row] = await this.db
      .select({ id: offerings.id, providerId: offerings.providerId })
      .from(offerings)
      .where(eq(offerings.id, offeringId))
      .limit(1);
    if (!row || !viewerCanEditCatalog(viewer, row.providerId)) {
      throw new PickiError("FORBIDDEN", "Không có quyền sửa sản phẩm chung");
    }
    await this.db
      .update(offerings)
      .set({
        ...(input.name != null ? { name: input.name.trim() } : {}),
        ...(input.description != null ? { description: input.description.trim() || null } : {}),
        ...(input.imageUrl != null ? { imageUrl: input.imageUrl.trim() || null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(offerings.id, offeringId));
    return { ok: true };
  }

  async setPrice(
    userId: string,
    offeringId: string,
    locationId: string,
    priceVnd: number,
    scopeType?: string,
    scopeId?: string,
  ) {
    const location = await this.locationInScope(userId, locationId, scopeType, scopeId);
    await this.assertOffering(location.providerId, offeringId);
    const [existing] = await this.db
      .select({ id: offeringPrices.id })
      .from(offeringPrices)
      .where(and(eq(offeringPrices.offeringId, offeringId), eq(offeringPrices.providerLocationId, locationId)))
      .limit(1);
    if (existing) {
      await this.db.update(offeringPrices).set({ amountVnd: priceVnd }).where(eq(offeringPrices.id, existing.id));
    } else {
      await this.db.insert(offeringPrices).values({
        offeringId,
        providerLocationId: locationId,
        amountVnd: priceVnd,
      });
    }
    return { ok: true };
  }

  async setStock(
    userId: string,
    offeringId: string,
    locationId: string,
    quantity: number,
    scopeType?: string,
    scopeId?: string,
  ) {
    const location = await this.locationInScope(userId, locationId, scopeType, scopeId);
    await this.assertOffering(location.providerId, offeringId);
    await this.db.transaction((tx) =>
      setDailySellableQty(tx, {
        providerLocationId: locationId,
        offeringId,
        serviceDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()),
        quantity,
      }),
    );
    return { ok: true };
  }

  async setAvailability(
    userId: string,
    offeringId: string,
    locationId: string,
    action: "sold_out" | "hide" | "show",
    scopeType?: string,
    scopeId?: string,
  ) {
    const location = await this.locationInScope(userId, locationId, scopeType, scopeId);
    await this.assertOffering(location.providerId, offeringId);
    await this.db.transaction((tx) =>
      applyDailyStockAction(tx, {
        providerLocationId: locationId,
        offeringId,
        serviceDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()),
        action,
      }),
    );
    return { ok: true };
  }

  async today(userId: string, scopeType?: string, scopeId?: string) {
    const { scope, locations } = await this.scoped(userId, scopeType, scopeId);
    return { scope, rows: await chainToday(this.db, locations) };
  }

  async members(userId: string, scopeType?: string, scopeId?: string) {
    const { viewer } = await this.scoped(userId, scopeType, scopeId);
    this.assertManage(viewer);
    const visible = await this.visibleMembers(viewer);
    return { members: visible };
  }

  async addMember(
    userId: string,
    input: { phone: string; role: string; scopeType: ChainScopeType; scopeId: string },
    scopeType?: string,
    scopeId?: string,
  ) {
    const { viewer } = await this.scoped(userId, scopeType, scopeId);
    this.assertManage(viewer);
    const allowed = viewer.grants.some((actor) =>
      canGrantMember({
        actor,
        role: input.role,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        locations: viewer.locations,
      }),
    );
    if (!allowed) throw new PickiError("FORBIDDEN", "Không gán được phạm vi này");
    const providerId = viewer.locations.find((location) =>
      locationsInScope(
        viewer.grants.filter((grant) =>
          canGrantMember({
            actor: grant,
            role: input.role,
            scopeType: input.scopeType,
            scopeId: input.scopeId,
            locations: viewer.locations,
          }),
        ),
        viewer.locations,
        input,
      )?.some((row) => row.id === location.id),
    )?.providerId;
    if (!providerId) throw new PickiError("FORBIDDEN", "Không gán được phạm vi này");
    const phone = normalizePhone(input.phone);
    const [identity] = await this.db
      .select({ userId: userIdentities.userId })
      .from(userIdentities)
      .where(and(eq(userIdentities.provider, "PHONE"), eq(userIdentities.externalUserId, phone)))
      .limit(1);
    if (!identity) throw new PickiError("NOT_FOUND", "Chưa có tài khoản với số này");
    await this.db.insert(providerMembers).values({
      userId: identity.userId,
      providerId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    });
    return { ok: true };
  }

  async removeMember(userId: string, memberId: string, scopeType?: string, scopeId?: string) {
    const { viewer } = await this.scoped(userId, scopeType, scopeId);
    this.assertManage(viewer);
    const [member] = await this.db.select().from(providerMembers).where(eq(providerMembers.id, memberId)).limit(1);
    if (!member) throw new PickiError("NOT_FOUND", "Không thấy người dùng");
    const allowed = viewer.grants.some((actor) => {
      if (actor.role !== "OWNER" && actor.role !== "MANAGER") return false;
      if (member.role === "OWNER" && actor.role !== "OWNER") return false;
      if (actor.providerId !== member.providerId) return false;
      return (
        locationsInScope([actor], viewer.locations, {
          scopeType: member.scopeType as ChainScopeType,
          scopeId: member.scopeId,
        }) != null
      );
    });
    if (!allowed || member.userId === userId) {
      throw new PickiError("FORBIDDEN", "Không gỡ được người dùng này");
    }
    await this.db.delete(providerMembers).where(eq(providerMembers.id, memberId));
    return { ok: true };
  }

  private assertManage(viewer: ChainViewer) {
    if (!viewer.canManageMembers) throw new PickiError("FORBIDDEN", "Không có quyền quản người dùng");
  }

  private async visibleMembers(viewer: ChainViewer) {
    const providerIds = [...new Set(viewer.grants.map((grant) => grant.providerId))];
    if (providerIds.length === 0) return [];
    const actorLocations = new Set(
      locationsCoveredByGrants(viewer.grants, viewer.locations).map((location) => location.id),
    );
    const rows = await this.db
      .select({
        id: providerMembers.id,
        userId: providerMembers.userId,
        role: providerMembers.role,
        scopeType: providerMembers.scopeType,
        scopeId: providerMembers.scopeId,
        providerId: providerMembers.providerId,
        displayName: users.displayName,
        phone: userIdentities.externalUserId,
      })
      .from(providerMembers)
      .innerJoin(users, eq(users.id, providerMembers.userId))
      .leftJoin(
        userIdentities,
        and(eq(userIdentities.userId, providerMembers.userId), eq(userIdentities.provider, "PHONE")),
      )
      .where(inArray(providerMembers.providerId, providerIds));
    return rows.filter((row) => {
      const covered = locationsCoveredByGrants(
        [{ providerId: row.providerId, role: row.role, scopeType: row.scopeType, scopeId: row.scopeId }],
        viewer.locations,
      );
      return covered.length > 0 && covered.every((location) => actorLocations.has(location.id));
    });
  }

  private async scoped(userId: string, scopeType?: string, scopeId?: string) {
    const viewer = await loadChainViewer(this.db, userId);
    if (viewer.scopes.length === 0) throw new PickiError("FORBIDDEN", "Không có quyền ở phạm vi này");
    if (scopeType && scopeId) {
      const known = viewer.scopes.some((choice) => choice.scopeType === scopeType && choice.scopeId === scopeId);
      if (!known) throw new PickiError("FORBIDDEN", "Không có quyền ở phạm vi này");
    }
    const resolved = resolveChainScope(
      viewer,
      scopeType && scopeId ? { scopeType: scopeType as ChainScopeType, scopeId } : undefined,
    );
    if (!resolved.scope.scopeId) throw new PickiError("FORBIDDEN", "Không có quyền ở phạm vi này");
    return { viewer, ...resolved };
  }

  private async locationInScope(userId: string, locationId: string, scopeType?: string, scopeId?: string) {
    const { locations } = await this.scoped(userId, scopeType, scopeId);
    const location = locations.find((row) => row.id === locationId);
    if (!location) throw new PickiError("FORBIDDEN", "Điểm bán không thuộc phạm vi này");
    return location;
  }

  private async assertOffering(providerId: string, offeringId: string) {
    const [row] = await this.db
      .select({ id: offerings.id })
      .from(offerings)
      .where(and(eq(offerings.id, offeringId), eq(offerings.providerId, providerId)))
      .limit(1);
    if (!row) throw new PickiError("NOT_FOUND", "Không thấy sản phẩm");
  }
}
