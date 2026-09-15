import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  classifiedListings,
  discoveryBlocksForNow,
  listDailySpecialsForLocation,
  listDiscoveryProviders,
  listAutoProviders,
  listBeautyProviders,
  listEducationProviders,
  listHealthProviders,
  listPetProviders,
  listSportsProviders,
  listHomeServiceProviders,
  listLaundryProviders,
  listMapProviders,
  locationReviews,
  searchZone,
  userFavorites,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import { ZonesService } from "../zones/zones.service.js";

@Injectable()
export class DiscoveryService {
  constructor(
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(ZonesService) private readonly zones: ZonesService,
  ) {}

  async getDiscovery(slugOrId: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    const blocks = discoveryBlocksForNow();
    const enriched = await Promise.all(
      blocks.map(async (block) => ({
        ...block,
        providers: (await listDiscoveryProviders(this.sql, zone.id, block.foodMoments)).map(
          mapProvider,
        ),
      })),
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

    const community = await this.communitySummary(zone.id);

    return { zoneId: zone.id, slug: zone.slug, blocks: enriched, community };
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

  async search(slugOrId: string, query: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");
    if (!query.trim()) {
      return { results: [] };
    }

    const rows = await searchZone(this.sql, zone.id, query);
    return {
      results: rows.map((r) => ({
        kind: r.kind,
        locationId: r.location_id,
        providerId: r.provider_id,
        brandName: r.brand_name,
        displayName: r.display_name,
        liveStatus: r.live_status,
        offeringId: r.offering_id,
        offeringName: r.offering_name,
        amountVnd: r.amount_vnd,
      })),
    };
  }

  async map(slugOrId: string) {
    const zone = await this.zones.findZone(slugOrId);
    if (!zone) throw new PickiError("NOT_FOUND", "Zone not found");

    const rows = await listMapProviders(this.sql, zone.id);
    return {
      zoneId: zone.id,
      center: { lat: 20.9883, lng: 105.8414 },
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
    return { locationId };
  }

  async removeFavorite(userId: string, locationId: string) {
    await this.db
      .delete(userFavorites)
      .where(
        and(eq(userFavorites.userId, userId), eq(userFavorites.providerLocationId, locationId)),
      );
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
  };
}
