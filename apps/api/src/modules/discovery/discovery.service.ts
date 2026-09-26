import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  classifiedListings,
  discoveryBlocksForNow,
  isWithinLateNightWindow,
  listDailySpecialsForLocation,
  listDiscoveryProviders,
  listBreakfastPreorderProvidersEnabled,
  listLateNightProvidersEnabled,
  listAutoProviders,
  listBeautyProviders,
  listEducationProviders,
  listHealthProviders,
  listPharmacyProviders,
  listMarketProviders,
  listTransportProviders,
  listPetProviders,
  listSportsProviders,
  listHomeServiceProviders,
  listLaundryProviders,
  listMapProviders,
  listProvidersByTypes,
  locationReviews,
  listFamiliarProvidersInZone,
  listNowAroundInZone,
  listFamilyDinnerProvidersEnabled,
  listExploreProviders,
  listLiveDealInZone,
  listOrganicFreshInZone,
  listPresenceForLocations,
  listSpotlightInZone,
  type ExploreChip,
  type PresenceCard,
  searchZoneUniversal,
  syncRelationshipFavorite,
  hideFamiliarSuggestion,
  getZoneBoundaryGeoJson,
  userFavorites,
  openingReminders,
  vnNowHhMm,
  type PickiDb,
  type PickiSql,
  type MapProviderFilters,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import { AnalyticsService } from "../analytics/analytics.service.js";
import { ZonesService } from "../zones/zones.service.js";
import {
  defaultBreakfastServiceDate,
  isPastBreakfastCutoff,
} from "../breakfast-preorder/breakfast-preorder.service.js";

@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(ZonesService) private readonly zones: ZonesService,
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  async getDiscovery(slugOrId: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    const blocks = discoveryBlocksForNow();
    const nowHm = vnNowHhMm();
    const lateRows = await listLateNightProvidersEnabled(this.sql, zone.id);
    const lateAccepting = lateRows.filter((r) =>
      isWithinLateNightWindow(nowHm, r.late_starts_at, r.late_ends_at),
    );

    const breakfastServiceDate = defaultBreakfastServiceDate();
    const breakfastRows = await listBreakfastPreorderProvidersEnabled(
      this.sql,
      zone.id,
      breakfastServiceDate,
    );
    const breakfastAccepting = breakfastRows.filter((r) => {
      const openFrom = (r.open_from_time ?? "20:00").slice(0, 5);
      const cutoff = (r.cutoff_time ?? "23:30").slice(0, 5);
      return (
        isPastBreakfastCutoff(breakfastServiceDate, openFrom) &&
        !isPastBreakfastCutoff(breakfastServiceDate, cutoff)
      );
    });

    const enriched = await Promise.all(
      blocks.map(async (block) => {
        if (block.id === "late-snack") {
          return {
            ...block,
            providers: lateAccepting.map(mapProvider),
            href: "/late-night",
          };
        }
        if (block.id === "breakfast-preorder") {
          return {
            ...block,
            providers: breakfastAccepting.map(mapProvider),
            href: "/breakfast",
          };
        }
        if (block.id === "dinner-plan" || block.id === "dinner-rescue") {
          const kitchens = await listFamilyDinnerProvidersEnabled(this.sql, zone.id);
          const extras = await listDiscoveryProviders(this.sql, zone.id, block.foodMoments);
          const seen = new Set(kitchens.map((k) => k.location_id));
          const merged = [
            ...kitchens,
            ...extras.filter((r) => !seen.has(r.location_id)),
          ];
          return {
            ...block,
            providers: merged.map(mapProvider),
            href: "/family-dinner",
          };
        }
        return {
          ...block,
          providers: (await listDiscoveryProviders(this.sql, zone.id, block.foodMoments)).map(
            mapProvider,
          ),
        };
      }),
    );

    const laundry = await listLaundryProviders(this.sql, zone.id);
    if (laundry.length > 0) {
      enriched.push({
        id: "laundry",
        title: "GIẶT LÀ",
        subtitle: "Lấy đồ tận nhà — giao tiệm giặt",
        foodMoments: [],
        providers: laundry.map(mapProvider),
      });
    }

    const homeServices = await listHomeServiceProviders(this.sql, zone.id);
    if (homeServices.length > 0) {
      enriched.push({
        id: "home-services",
        title: "DỊCH VỤ NHÀ",
        subtitle: "Sửa điện, nước, vệ sinh — thợ đến tận nhà",
        foodMoments: [],
        providers: homeServices.map(mapProvider),
      });
    }

    const beauty = await listBeautyProviders(this.sql, zone.id);
    if (beauty.length > 0) {
      enriched.push({
        id: "beauty",
        title: "LÀM ĐẸP",
        subtitle: "Cắt tóc, nail, spa — xem thời gian chờ live",
        foodMoments: [],
        providers: beauty.map(mapProvider),
      });
    }

    const education = await listEducationProviders(this.sql, zone.id);
    if (education.length > 0) {
      enriched.push({
        id: "education",
        title: "HỌC TẬP",
        subtitle: "Gia sư, học thêm, lớp trẻ em — đặt buổi học thử",
        foodMoments: [],
        providers: education.map(mapProvider),
      });
    }

    const pet = await listPetProviders(this.sql, zone.id);
    if (pet.length > 0) {
      enriched.push({
        id: "pet",
        title: "THÚ CƯNG",
        subtitle: "Spa pet, trông pet, dắt chó — báo sắp tới hoặc gửi yêu cầu",
        foodMoments: [],
        providers: pet.map(mapProvider),
      });
    }

    const auto = await listAutoProviders(this.sql, zone.id);
    if (auto.length > 0) {
      enriched.push({
        id: "auto",
        title: "XE MÁY / Ô TÔ",
        subtitle: "Rửa xe, bơm lốp — xem chờ live · thay dầu/sửa chữa liên hệ trực tiếp",
        foodMoments: [],
        providers: auto.map(mapProvider),
      });
    }

    const health = await listHealthProviders(this.sql, zone.id);
    if (health.length > 0) {
      enriched.push({
        id: "health",
        title: "PHÒNG KHÁM",
        subtitle: "Đa khoa, nha khoa, đông y — xem chờ live, báo sắp tới khám",
        foodMoments: [],
        providers: health.map(mapProvider),
      });
    }

    const pharmacies = await listPharmacyProviders(this.sql, zone.id);
    if (pharmacies.length > 0) {
      enriched.push({
        id: "pharmacy",
        title: "NHÀ THUỐC",
        subtitle: "Hiệu gần bạn đang mở — gọi hỏi còn hàng rồi qua lấy (đặc biệt hữu ích đêm muộn)",
        foodMoments: [],
        providers: pharmacies.map(mapProvider),
      });
    }

    const markets = await listMarketProviders(this.sql, zone.id);
    if (markets.length > 0) {
      enriched.push({
        id: "market",
        title: "ĐI CHỢ",
        subtitle: "Tạp hóa, minimart, sạp gần nhà — hỏi còn hàng rồi qua lấy",
        foodMoments: [],
        providers: markets.map(mapProvider),
      });
    }

    const sports = await listSportsProviders(this.sql, zone.id);
    if (sports.length > 0) {
      enriched.push({
        id: "sports",
        title: "ĐẶT SÂN",
        subtitle: "Pickleball, bóng đá, cầu lông — gửi yêu cầu khung giờ",
        foodMoments: [],
        providers: sports.map(mapProvider),
      });
    }

    const transport = await listTransportProviders(this.sql, zone.id);
    if (transport.length > 0) {
      enriched.push({
        id: "transport",
        title: "XE ĐƯA ĐÓN",
        subtitle: "Sân bay, về quê, du lịch, đưa đón học sinh — gọi hỏi lịch & giá",
        foodMoments: [],
        providers: transport.map(mapProvider),
      });
    }

    const community = await this.communitySummary(zone.id);

    return { zoneId: zone.id, slug: zone.slug, blocks: enriched, community };
  }

  /** Home category browse — filter by provider_type set. */
  async browseCategory(slugOrId: string, categoryId: string, providerTypes: string[]) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");
    const rows = await listProvidersByTypes(this.sql, zone.id, providerTypes);
    return {
      zoneId: zone.id,
      slug: zone.slug,
      categoryId,
      providers: rows.map(mapProvider),
    };
  }

  private async communitySummary(zoneId: string) {
    const counts = await this.db
      .select({
        listingType: classifiedListings.listingType,
        count: sql<number>`count(*)::int`,
      })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.zoneId, zoneId),
          inArray(classifiedListings.status, ["AVAILABLE", "RESERVED"]),
        ),
      )
      .groupBy(classifiedListings.listingType);

    const resaleCount = counts.find((r) => r.listingType === "RESALE")?.count ?? 0;
    const giveAwayCount = counts.find((r) => r.listingType === "GIVE_AWAY")?.count ?? 0;
    const rentCount = counts.find((r) => r.listingType === "CHO_THUE")?.count ?? 0;
    const roommateCount = counts.find((r) => r.listingType === "O_GHEP")?.count ?? 0;
    const lostFoundCount = counts.find((r) => r.listingType === "LOST_FOUND")?.count ?? 0;
    const petLostCount = counts.find((r) => r.listingType === "PET_LOST")?.count ?? 0;

    const recent = await this.db
      .select({
        id: classifiedListings.id,
        listingType: classifiedListings.listingType,
        title: classifiedListings.title,
        priceVnd: classifiedListings.priceVnd,
        status: classifiedListings.status,
        locationLabel: classifiedListings.locationLabel,
        photoUrl: classifiedListings.photoUrl,
        photoUrls: classifiedListings.photoUrls,
      })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.zoneId, zoneId),
          inArray(classifiedListings.status, ["AVAILABLE", "RESERVED"]),
        ),
      )
      .orderBy(desc(classifiedListings.createdAt))
      .limit(4);

    return {
      resaleCount,
      giveAwayCount,
      rentCount,
      roommateCount,
      lostFoundCount,
      petLostCount,
      recentListings: recent.map((r) => {
        const photoUrls = Array.isArray(r.photoUrls)
          ? (r.photoUrls as string[]).filter((u) => typeof u === "string")
          : r.photoUrl
            ? [r.photoUrl]
            : [];
        return {
          id: r.id,
          listingType: r.listingType,
          title: r.title,
          priceVnd: r.priceVnd,
          status: r.status,
          locationLabel: r.locationLabel,
          photoUrl: photoUrls[0] ?? null,
        };
      }),
    };
  }

  async search(slugOrId: string, query: string, userId?: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");
    if (!query.trim()) {
      return { groups: [], results: [], zeroResult: true };
    }

    let familiarIds: string[] = [];
    if (userId) {
      const familiarRows = await listFamiliarProvidersInZone(this.sql, userId, zone.id, 20);
      familiarIds = familiarRows.map((r) => r.location_id);
    }

    const groups = await searchZoneUniversal(this.sql, {
      zoneId: zone.id,
      query,
      familiarLocationIds: familiarIds,
    });
    const presence = await listPresenceForLocations(
      this.sql,
      groups.flatMap((g) => g.results.map((r) => r.location_id).filter((id): id is string => Boolean(id))),
    );

    const results = groups.flatMap((g) =>
      g.results
        .filter((r) => r.kind !== "category")
        .map((r) => ({
          kind: r.kind,
          locationId: r.location_id,
          providerId: r.provider_id,
          brandName: r.brand_name,
          displayName: r.display_name,
          liveStatus: r.live_status,
          itemId: r.item_id,
          itemName: r.item_name,
          itemSubtitle: r.item_subtitle,
          amountVnd: r.amount_vnd,
          href: r.href_hint,
          lat: r.lat,
          lng: r.lng,
          familiar: r.familiar,
          groupId: g.id,
          freshnessLabel: r.location_id ? (presence.get(r.location_id)?.freshnessLabel ?? null) : null,
          promotionLabel: promoLabel(presence.get(r.location_id ?? "")),
        })),
    );

    const zeroResult = groups.every((g) => g.results.length === 0);
    const hitCount = groups.reduce((n, g) => n + g.results.length, 0);
    this.analytics.trackFireAndForget(userId, zeroResult ? "search_zero_result" : "search_query", {
      zoneId: zone.id,
      properties: {
        q: query.trim().slice(0, 80),
        hitCount,
        groupCount: groups.filter((g) => g.results.length > 0).length,
      },
    });

    return {
      groups: groups.map((g) => ({
        id: g.id,
        title: g.title,
        results: g.results.map((r) => ({
          kind: r.kind,
          locationId: r.location_id,
          providerId: r.provider_id,
          brandName: r.brand_name,
          displayName: r.display_name,
          liveStatus: r.live_status,
          itemId: r.item_id,
          itemName: r.item_name,
          itemSubtitle: r.item_subtitle,
          amountVnd: r.amount_vnd,
          href: r.href_hint,
          lat: r.lat,
          lng: r.lng,
          familiar: r.familiar,
          freshnessLabel: r.location_id ? (presence.get(r.location_id)?.freshnessLabel ?? null) : null,
          promotionLabel: promoLabel(presence.get(r.location_id ?? "")),
        })),
      })),
      results,
      zeroResult,
    };
  }

  async map(slugOrId: string, filters: MapProviderFilters = {}) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    const [rows, boundary] = await Promise.all([
      listMapProviders(this.sql, zone.id, filters),
      getZoneBoundaryGeoJson(this.sql, zone.id),
    ]);
    return {
      zoneId: zone.id,
      slug: zone.slug,
      displayName: zone.displayName,
      center: { lat: zone.anchorLat, lng: zone.anchorLng },
      boundary,
      markers: rows.map(mapProvider),
    };
  }

  async listReviews(locationId: string) {
    const rows = await this.db
      .select()
      .from(locationReviews)
      .where(eq(locationReviews.providerLocationId, locationId))
      .orderBy(desc(locationReviews.createdAt))
      .limit(20);

    const avg = rows.length
      ? rows.reduce((s, r) => s + r.rating, 0) / rows.length
      : null;

    return {
      averageRating: avg ? Math.round(avg * 10) / 10 : null,
      count: rows.length,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async addReview(userId: string, locationId: string, rating: number, comment?: string) {
    const existing = await this.db
      .select()
      .from(locationReviews)
      .where(
        and(
          eq(locationReviews.providerLocationId, locationId),
          eq(locationReviews.customerUserId, userId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [updated] = await this.db
        .update(locationReviews)
        .set({ rating, comment: comment ?? null, createdAt: new Date() })
        .where(eq(locationReviews.id, existing[0].id))
        .returning();
      return { id: updated!.id, rating: updated!.rating };
    }

    const [review] = await this.db
      .insert(locationReviews)
      .values({
        providerLocationId: locationId,
        customerUserId: userId,
        rating,
        comment: comment ?? null,
      })
      .returning();

    return { id: review!.id, rating: review!.rating };
  }

  async listFavorites(userId: string) {
    const rows = await this.db
      .select()
      .from(userFavorites)
      .where(eq(userFavorites.userId, userId))
      .orderBy(desc(userFavorites.createdAt));

    return {
      favorites: rows.map((r) => ({
        locationId: r.providerLocationId,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async addFavorite(userId: string, locationId: string) {
    await this.db
      .insert(userFavorites)
      .values({ userId, providerLocationId: locationId })
      .onConflictDoNothing();
    await syncRelationshipFavorite(this.sql, userId, locationId, true);
    this.analytics.trackFireAndForget(userId, "favorite_add", {
      properties: { locationId },
    });
    return { locationId };
  }

  async removeFavorite(userId: string, locationId: string) {
    await this.db
      .delete(userFavorites)
      .where(
        and(eq(userFavorites.userId, userId), eq(userFavorites.providerLocationId, locationId)),
      );
    await syncRelationshipFavorite(this.sql, userId, locationId, false);
    this.analytics.trackFireAndForget(userId, "favorite_remove", {
      properties: { locationId },
    });
  }

  async hideFamiliar(userId: string, locationId: string) {
    await hideFamiliarSuggestion(this.sql, userId, locationId);
    return { ok: true };
  }

  /**
   * Habit-First home: familiar · nowAround (live) · discover blocks (deduped).
   */
  async getHabitHome(slugOrId: string, userId: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    const discovery = await this.getDiscovery(slugOrId);
    const familiarRows = await listFamiliarProvidersInZone(this.sql, userId, zone.id, 5);
    const familiarIds = new Set(familiarRows.map((r) => r.location_id));
    const nowRows = await listNowAroundInZone(this.sql, zone.id, 5);
    const [organicFresh, liveDeal, spotlight] = await Promise.all([
      listOrganicFreshInZone(this.sql, zone.id),
      listLiveDealInZone(this.sql, zone.id),
      listSpotlightInZone(this.sql, zone.id),
    ]);
    const familiarPresence = await listPresenceForLocations(
      this.sql,
      familiarRows.map((r) => r.location_id),
    );

    const familiar = familiarRows.map((r) => ({
      locationId: r.location_id,
      providerId: r.provider_id,
      brandName: r.brand_name,
      displayName: r.display_name,
      providerType: r.provider_type,
      liveStatus: r.live_status,
      estimatedWaitMinutes: r.estimated_wait_minutes,
      completedInteractions: Number(r.completed_interactions),
      relationshipScore: Number(r.relationship_score),
      relationshipStatus: r.relationship_status,
      favorite: r.favorite,
      lastInteractionAt: r.last_interaction_at
        ? new Date(r.last_interaction_at).toISOString()
        : null,
      lat: r.lat,
      lng: r.lng,
      familiarOffer:
        familiarPresence.get(r.location_id)?.promotion?.kind === "FAMILIAR"
          ? familiarPresence.get(r.location_id)?.promotion
          : null,
    }));

    const nowAround = nowRows.map((r) => {
      const headline =
        r.update_title?.trim() ||
        (r.estimated_wait_minutes != null && r.estimated_wait_minutes <= 5
          ? "Ra được ngay"
          : r.estimated_wait_minutes != null
            ? `~${String(r.estimated_wait_minutes)} phút chờ`
            : null) ||
        r.live_message?.trim() ||
        r.sample_offering ||
        r.tagline ||
        "Đang phục vụ quanh bạn";
      return {
        locationId: r.location_id,
        providerId: r.provider_id,
        brandName: r.brand_name,
        displayName: r.display_name,
        providerType: r.provider_type,
        liveStatus: r.live_status,
        estimatedWaitMinutes: r.estimated_wait_minutes,
        headline,
        detail: r.update_description,
        source: r.source,
        updateId: r.update_id,
        ctaLabel: "Xem",
        ctaHref: `/locations/${r.location_id}`,
        badge: null as string | null,
        sponsored: false,
      };
    });

    const seen = new Set(nowAround.map((n) => n.locationId));
    const injected: typeof nowAround = [];
    if (organicFresh && !seen.has(organicFresh.locationId)) {
      injected.push(presenceToNow(organicFresh, organicFresh.freshnessLabel));
      seen.add(organicFresh.locationId);
    }
    if (
      liveDeal &&
      liveDeal.promotion &&
      !seen.has(liveDeal.locationId) &&
      liveDeal.locationId !== organicFresh?.locationId
    ) {
      injected.push(presenceToNow(liveDeal, liveDeal.promotion.kindLabel));
    }
    const mergedNow = [...injected, ...nowAround].slice(0, 5);

    const discoverBlocks = (
      discovery.blocks as { id: string; providers: { locationId: string }[] }[]
    ).map((block) => ({
      ...block,
      providers: block.providers
        .filter((p) => !familiarIds.has(p.locationId))
        .slice(0, 5),
    }));

    return {
      zoneId: zone.id,
      slug: zone.slug,
      displayName: zone.displayName,
      habitHome: true,
      familiar,
      nowAround: mergedNow,
      spotlight: spotlight
        ? {
            locationId: spotlight.locationId,
            brandName: spotlight.brandName,
            title: spotlight.promotion?.title ?? spotlight.brandName,
            detail: spotlight.promotion?.detail,
            kindLabel: spotlight.promotion?.kindLabel ?? "Tài trợ",
            href: `/locations/${spotlight.locationId}`,
            sponsored: true,
          }
        : null,
      /** @deprecated use nowAround */
      today: mergedNow.map((n) => ({
        id: n.updateId ?? n.locationId,
        locationId: n.locationId,
        brandName: n.brandName,
        displayName: n.displayName,
        updateType: n.source,
        title: n.headline,
        description: n.detail,
        imageUrls: [] as string[],
        ctaLabel: n.ctaLabel,
        ctaHref: n.ctaHref,
        liveStatus: n.liveStatus,
      })),
      blocks: discoverBlocks,
      community: discovery.community ?? null,
      exploreChips: [
        { id: "open", label: "Đang mở" },
        { id: "new", label: "Mới" },
        { id: "near", label: "Gần tôi" },
        { id: "popular", label: "Được dùng nhiều" },
      ],
    };
  }

  async exploreZone(
    slugOrId: string,
    chip: ExploreChip,
    userId?: string,
  ) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    let exclude: string[] = [];
    if (userId) {
      const familiar = await listFamiliarProvidersInZone(this.sql, userId, zone.id, 20);
      exclude = familiar.map((f) => f.location_id);
    }

    const rows = await listExploreProviders(this.sql, zone.id, chip, {
      excludeLocationIds: exclude,
      limit: 8,
    });
    const providers = rows.map(mapProvider);
    const presence = await listPresenceForLocations(
      this.sql,
      providers.map((p) => p.locationId),
    );

    return {
      zoneId: zone.id,
      slug: zone.slug,
      chip,
      providers: providers.map((p) => decorateProvider(p, presence.get(p.locationId))),
    };
  }

  async locationPresence(userId: string, locationId: string) {
    const presence = await listPresenceForLocations(this.sql, [locationId]);
    const card = presence.get(locationId) ?? null;
    const reminder = await this.db
      .select({ id: openingReminders.id })
      .from(openingReminders)
      .where(
        and(eq(openingReminders.userId, userId), eq(openingReminders.providerLocationId, locationId)),
      )
      .limit(1);
    return {
      freshnessLabel: card?.freshnessLabel ?? null,
      opensAt: card?.opensAt ?? null,
      promotion: card?.promotion ?? null,
      reminding: Boolean(reminder[0]),
    };
  }

  async subscribeOpening(userId: string, locationId: string) {
    await this.addFavorite(userId, locationId);
    await this.db
      .insert(openingReminders)
      .values({ userId, providerLocationId: locationId })
      .onConflictDoNothing();
    return { ok: true };
  }

  async listDailySpecials(locationId: string) {
    const rows = await listDailySpecialsForLocation(this.sql, locationId);
    return {
      specials: rows.map((s) => ({
        id: s.special_id,
        offeringId: s.offering_id,
        name: s.name,
        description: s.description,
        amountVnd: s.amount_vnd,
        quantityRemaining: s.quantity_remaining,
        foodMoment: s.food_moment,
        fulfillmentMode: s.fulfillment_mode,
      })),
    };
  }
}

function mapProvider(r: {
  location_id: string;
  provider_id: string;
  brand_name: string;
  display_name: string;
  provider_type: string;
  tagline: string | null;
  live_status: string;
  prep_minutes: number | null;
  eta_minutes: number | null;
  estimated_wait_minutes: number | null;
  address_line: string | null;
  lat: number | null;
  lng: number | null;
  avg_rating: string | null;
  review_count: string;
  sample_offering: string | null;
  logo_url?: string | null;
}) {
  return {
    locationId: r.location_id,
    providerId: r.provider_id,
    brandName: r.brand_name,
    displayName: r.display_name,
    providerType: r.provider_type,
    tagline: r.tagline,
    liveStatus: r.live_status,
    prepMinutes: r.prep_minutes,
    etaMinutes: r.eta_minutes,
    estimatedWaitMinutes: r.estimated_wait_minutes,
    addressLine: r.address_line,
    lat: r.lat,
    lng: r.lng,
    averageRating: r.avg_rating ? Number(r.avg_rating) : null,
    reviewCount: Number(r.review_count),
    sampleOffering: r.sample_offering,
    logoUrl: r.logo_url ?? null,
  };
}

function decorateProvider<T extends { locationId: string }>(
  provider: T,
  card: PresenceCard | undefined,
) {
  return {
    ...provider,
    freshnessLabel: card?.freshnessLabel ?? null,
    promotionLabel: promoLabel(card),
  };
}

function promoLabel(card: PresenceCard | undefined): string | null {
  if (!card?.promotion || card.promotion.spotlight) return null;
  return card.promotion.title;
}

function presenceToNow(card: PresenceCard, badge: string | null) {
  return {
    locationId: card.locationId,
    providerId: card.locationId,
    brandName: card.brandName,
    displayName: card.brandName,
    providerType: card.providerType,
    liveStatus: card.liveStatus,
    estimatedWaitMinutes: null,
    headline: card.promotion?.title || card.sampleOffering || card.freshnessLabel || card.brandName,
    detail: card.promotion?.detail ?? null,
    source: "LIVE" as const,
    updateId: null,
    ctaLabel: card.freshness === "UPCOMING" ? "Xem trước" : "Xem",
    ctaHref: `/locations/${card.locationId}`,
    badge,
    sponsored: false,
  };
}
