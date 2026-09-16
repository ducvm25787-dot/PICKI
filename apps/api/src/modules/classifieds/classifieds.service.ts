import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  HOUSING_LISTING_MONTHLY_CREATE_LIMIT,
  LOST_LISTING_ACTIVE_LIMIT,
  LOST_LISTING_MONTHLY_CREATE_LIMIT,
  canClassifiedTransition,
  classifiedCompleteStatus,
  classifiedListings,
  classifiedReservations,
  housingExpiresAt,
  isClassifiedBrowsable,
  isContactOnlyListingType,
  isHousingListingType,
  isLostListingType,
  lostExpiresAt,
  userIdentities,
  userZoneMemberships,
  users,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createClassifiedSchema, listClassifiedsQuerySchema } from "./dto.js";

const UNIQUE_VIOLATION = "23505";

@Injectable()
export class ClassifiedsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, input: z.infer<typeof createClassifiedSchema>) {
    await this.assertZoneMember(userId, input.zoneId);

    const housing = isHousingListingType(input.listingType);
    const lost = isLostListingType(input.listingType);
    const contactOnly = isContactOnlyListingType(input.listingType);

    if (housing || lost) {
      await this.assertPhoneVerified(userId, housing ? "housing" : "lost");
    }
    if (housing) {
      await this.assertHousingQuota(userId);
    }
    if (lost) {
      await this.assertLostQuota(userId);
    }

    if (input.listingType === "GIVE_AWAY" && input.priceVnd != null && input.priceVnd > 0) {
      throw new PickiError("VALIDATION_ERROR", "Cho tặng không cần giá");
    }
    if (input.listingType === "RESALE" && (input.priceVnd == null || input.priceVnd <= 0)) {
      throw new PickiError("VALIDATION_ERROR", "Nhập giá bán");
    }
    if (lost && input.priceVnd != null && input.priceVnd > 0) {
      throw new PickiError("VALIDATION_ERROR", "Tin thất lạc không có giá");
    }
    if (housing && input.condition) {
      throw new PickiError("VALIDATION_ERROR", "Tin cho thuê/ở ghép không dùng tình trạng đồ");
    }
    if (lost && input.condition) {
      throw new PickiError("VALIDATION_ERROR", "Tin thất lạc không dùng tình trạng đồ");
    }
    if (input.listingType === "PET_LOST" && (input.photoUrls?.length ?? 0) < 1) {
      throw new PickiError("VALIDATION_ERROR", "Tin thú cưng thất lạc cần ít nhất 1 ảnh");
    }

    const listingNumber = this.allocateListingNumber(input.listingType);
    const expiresAt = housing ? housingExpiresAt() : lost ? lostExpiresAt() : null;

    try {
      const created = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(classifiedListings)
          .values({
            listingNumber,
            zoneId: input.zoneId,
            sellerUserId: userId,
            listingType: input.listingType,
            status: "AVAILABLE",
            title: input.title.trim(),
            description: input.description?.trim() ?? null,
            priceVnd:
              input.listingType === "GIVE_AWAY" || lost ? null : (input.priceVnd ?? null),
            condition: contactOnly ? null : (input.condition ?? null),
            photoUrl: input.photoUrls?.[0] ?? null,
            photoUrls: input.photoUrls ?? [],
            locationLabel: input.locationLabel.trim(),
            expiresAt,
          })
          .returning();

        if (!row) {
          throw new PickiError("INTERNAL_ERROR", "Failed to create listing");
        }

        await this.outbox.enqueue(tx, {
          eventType: "classified.created",
          aggregateType: "classified_listing",
          aggregateId: row.id,
          payload: {
            listingId: row.id,
            listingNumber: row.listingNumber,
            zoneId: row.zoneId,
            sellerUserId: row.sellerUserId,
            listingType: row.listingType,
            title: row.title,
          },
        });

        return row;
      });

      return this.toDto(created);
    } catch (err) {
      if (housing && isUniqueViolation(err)) {
        throw new PickiError(
          "CONFLICT",
          "Bạn đang có tin cho thuê/ở ghép đang mở — xóa hoặc chờ hết hạn rồi đăng tin khác",
        );
      }
      throw err;
    }
  }

  async listForZone(userId: string, query: z.infer<typeof listClassifiedsQuerySchema>) {
    if (!query.zoneId) {
      throw new PickiError("VALIDATION_ERROR", "zoneId is required");
    }
    await this.assertZoneMember(userId, query.zoneId);

    const conditions = [eq(classifiedListings.zoneId, query.zoneId)];
    if (query.listingType) {
      conditions.push(eq(classifiedListings.listingType, query.listingType));
    }
    if (query.status) {
      conditions.push(eq(classifiedListings.status, query.status));
    } else {
      conditions.push(inArray(classifiedListings.status, ["AVAILABLE", "RESERVED"]));
    }

    const rows = await this.db
      .select()
      .from(classifiedListings)
      .where(and(...conditions))
      .orderBy(desc(classifiedListings.createdAt))
      .limit(50);

    return { listings: rows.map((r) => this.toDto(r)) };
  }

  async communitySummary(zoneId: string) {
    const rows = await this.db
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

    const countOf = (type: string) => rows.find((r) => r.listingType === type)?.count ?? 0;

    const recent = await this.db
      .select()
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
      resaleCount: countOf("RESALE"),
      giveAwayCount: countOf("GIVE_AWAY"),
      rentCount: countOf("CHO_THUE"),
      roommateCount: countOf("O_GHEP"),
      lostFoundCount: countOf("LOST_FOUND"),
      petLostCount: countOf("PET_LOST"),
      recentListings: recent.map((r) => this.toDto(r)),
    };
  }

  async listMine(userId: string) {
    const rows = await this.db
      .select()
      .from(classifiedListings)
      .where(eq(classifiedListings.sellerUserId, userId))
      .orderBy(desc(classifiedListings.createdAt))
      .limit(50);

    return { listings: rows.map((r) => this.toDto(r)) };
  }

  async listMyReservations(userId: string) {
    const rows = await this.db
      .select({
        reservation: classifiedReservations,
        listing: classifiedListings,
      })
      .from(classifiedReservations)
      .innerJoin(classifiedListings, eq(classifiedListings.id, classifiedReservations.listingId))
      .where(
        and(
          eq(classifiedReservations.buyerUserId, userId),
          eq(classifiedReservations.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(classifiedReservations.createdAt))
      .limit(50);

    return {
      reservations: rows.map((r) => ({
        id: r.reservation.id,
        status: r.reservation.status,
        createdAt: r.reservation.createdAt.toISOString(),
        listing: this.toDto(r.listing),
      })),
    };
  }

  async get(userId: string, listingId: string) {
    const row = await this.loadListing(listingId);
    await this.assertZoneMember(userId, row.zoneId);

    if (
      !isClassifiedBrowsable(row.status) &&
      row.sellerUserId !== userId &&
      row.reservedByUserId !== userId
    ) {
      throw new PickiError("NOT_FOUND", "Listing not found");
    }

    const seller = await this.loadUserDisplay(row.sellerUserId);
    let reservedByDisplay: string | null = null;
    if (row.reservedByUserId) {
      reservedByDisplay = (await this.loadUserDisplay(row.reservedByUserId))?.displayName ?? null;
    }

    return {
      ...this.toDto(row),
      sellerDisplayName: seller?.displayName ?? null,
      reservedByDisplayName: reservedByDisplay,
      mine: row.sellerUserId === userId,
      reservedByMe: row.reservedByUserId === userId,
    };
  }

  async reserve(userId: string, listingId: string) {
    const listing = await this.loadListing(listingId);
    await this.assertZoneMember(userId, listing.zoneId);

    if (isContactOnlyListingType(listing.listingType)) {
      throw new PickiError(
        "VALIDATION_ERROR",
        isLostListingType(listing.listingType)
          ? "Tin thất lạc — liên hệ trực tiếp, không giữ chỗ"
          : "Tin cho thuê/ở ghép — liên hệ trực tiếp, không giữ chỗ",
      );
    }

    if (listing.sellerUserId === userId) {
      throw new PickiError("VALIDATION_ERROR", "Không thể giữ chỗ tin của chính mình");
    }
    if (listing.status === "RESERVED" && listing.reservedByUserId === userId) {
      return this.get(userId, listingId);
    }
    if (listing.status !== "AVAILABLE") {
      throw new PickiError("CONFLICT", "Tin đã được giữ hoặc không còn khả dụng");
    }

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(classifiedListings)
        .set({
          status: "RESERVED",
          reservedByUserId: userId,
          reservedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(classifiedListings.id, listingId), eq(classifiedListings.status, "AVAILABLE")))
        .returning();

      if (!row) {
        throw new PickiError("CONFLICT", "Tin vừa được người khác giữ");
      }

      await tx.insert(classifiedReservations).values({
        listingId,
        buyerUserId: userId,
        status: "ACTIVE",
      });

      await this.outbox.enqueue(tx, {
        eventType: "classified.reserved",
        aggregateType: "classified_listing",
        aggregateId: listingId,
        payload: {
          listingId,
          listingNumber: row.listingNumber,
          zoneId: row.zoneId,
          sellerUserId: row.sellerUserId,
          buyerUserId: userId,
          title: row.title,
          listingType: row.listingType,
        },
      });

      return row;
    });

    return this.get(userId, updated.id);
  }

  async complete(userId: string, listingId: string) {
    const listing = await this.loadListing(listingId);
    if (isContactOnlyListingType(listing.listingType)) {
      throw new PickiError("VALIDATION_ERROR", "Tin này không dùng giữ chỗ");
    }
    if (listing.sellerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Chỉ người đăng mới xác nhận giao xong");
    }
    if (listing.status !== "RESERVED") {
      throw new PickiError("VALIDATION_ERROR", "Tin chưa được giữ chỗ");
    }

    const terminal = classifiedCompleteStatus(
      listing.listingType as "RESALE" | "GIVE_AWAY",
    );
    if (!canClassifiedTransition(listing.status, terminal)) {
      throw new PickiError("VALIDATION_ERROR", "Không thể hoàn tất tin này");
    }

    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(classifiedListings)
        .set({
          status: terminal,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(classifiedListings.id, listingId), eq(classifiedListings.status, "RESERVED")))
        .returning();

      if (!row) {
        throw new PickiError("CONFLICT", "Trạng thái tin đã thay đổi");
      }

      await tx
        .update(classifiedReservations)
        .set({ status: "COMPLETED", updatedAt: new Date() })
        .where(
          and(
            eq(classifiedReservations.listingId, listingId),
            eq(classifiedReservations.status, "ACTIVE"),
          ),
        );

      await this.outbox.enqueue(tx, {
        eventType: terminal === "GIVEN" ? "classified.given" : "classified.completed",
        aggregateType: "classified_listing",
        aggregateId: listingId,
        payload: {
          listingId,
          listingNumber: row.listingNumber,
          zoneId: row.zoneId,
          sellerUserId: row.sellerUserId,
          buyerUserId: row.reservedByUserId,
          title: row.title,
          listingType: row.listingType,
        },
      });
    });

    return this.get(userId, listingId);
  }

  async cancelReservation(userId: string, listingId: string) {
    const listing = await this.loadListing(listingId);
    if (isContactOnlyListingType(listing.listingType)) {
      throw new PickiError("VALIDATION_ERROR", "Tin này không dùng giữ chỗ");
    }
    if (listing.status !== "RESERVED") {
      throw new PickiError("VALIDATION_ERROR", "Tin không đang được giữ");
    }

    const isSeller = listing.sellerUserId === userId;
    const isBuyer = listing.reservedByUserId === userId;
    if (!isSeller && !isBuyer) {
      throw new PickiError("FORBIDDEN", "Không có quyền hủy giữ chỗ");
    }

    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(classifiedListings)
        .set({
          status: "AVAILABLE",
          reservedByUserId: null,
          reservedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(classifiedListings.id, listingId), eq(classifiedListings.status, "RESERVED")))
        .returning();

      if (!row) {
        throw new PickiError("CONFLICT", "Trạng thái tin đã thay đổi");
      }

      await tx
        .update(classifiedReservations)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(
          and(
            eq(classifiedReservations.listingId, listingId),
            eq(classifiedReservations.status, "ACTIVE"),
          ),
        );

      await this.outbox.enqueue(tx, {
        eventType: "classified.reservation_cancelled",
        aggregateType: "classified_listing",
        aggregateId: listingId,
        payload: {
          listingId,
          listingNumber: row.listingNumber,
          zoneId: row.zoneId,
          sellerUserId: row.sellerUserId,
          buyerUserId: row.reservedByUserId,
          cancelledByUserId: userId,
          title: row.title,
        },
      });
    });

    return this.get(userId, listingId);
  }

  async archive(userId: string, listingId: string) {
    const listing = await this.loadListing(listingId);
    if (listing.sellerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Chỉ người đăng mới ẩn tin");
    }
    if (!canClassifiedTransition(listing.status, "ARCHIVED")) {
      throw new PickiError("VALIDATION_ERROR", "Không thể ẩn tin ở trạng thái này");
    }

    await this.db
      .update(classifiedListings)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(eq(classifiedListings.id, listingId));

    return this.get(userId, listingId);
  }

  /**
   * Worker: ẩn tin có TTL hết hạn (housing 7 ngày · thất lạc 14 ngày).
   */
  async expireDueHousing(limit = 20): Promise<number> {
    const now = new Date();
    const ttlTypes = ["CHO_THUE", "O_GHEP", "LOST_FOUND", "PET_LOST"] as const;
    const due = await this.db
      .select({ id: classifiedListings.id })
      .from(classifiedListings)
      .where(
        and(
          inArray(classifiedListings.listingType, [...ttlTypes]),
          eq(classifiedListings.status, "AVAILABLE"),
          lte(classifiedListings.expiresAt, now),
        ),
      )
      .orderBy(classifiedListings.expiresAt)
      .limit(limit);

    let expired = 0;
    for (const row of due) {
      const claimed = await this.db.transaction(async (tx) => {
        const [next] = await tx
          .update(classifiedListings)
          .set({ status: "ARCHIVED", updatedAt: new Date() })
          .where(
            and(
              eq(classifiedListings.id, row.id),
              eq(classifiedListings.status, "AVAILABLE"),
              inArray(classifiedListings.listingType, [...ttlTypes]),
            ),
          )
          .returning();

        if (!next) return false;

        await this.outbox.enqueue(tx, {
          eventType: "classified.expired",
          aggregateType: "classified_listing",
          aggregateId: next.id,
          payload: {
            listingId: next.id,
            listingNumber: next.listingNumber,
            zoneId: next.zoneId,
            sellerUserId: next.sellerUserId,
            listingType: next.listingType,
            title: next.title,
          },
        });

        return true;
      });
      if (claimed) expired += 1;
    }

    return expired;
  }

  private async assertPhoneVerified(userId: string, kind: "housing" | "lost") {
    const rows = await this.db
      .select({ id: userIdentities.id })
      .from(userIdentities)
      .where(
        and(
          eq(userIdentities.userId, userId),
          eq(userIdentities.provider, "PHONE"),
          sql`${userIdentities.verifiedAt} IS NOT NULL`,
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new PickiError(
        "FORBIDDEN",
        kind === "lost"
          ? "Xác thực số điện thoại trước khi đăng tin thất lạc"
          : "Xác thực số điện thoại trước khi đăng tin cho thuê/ở ghép",
      );
    }
  }

  private async assertHousingQuota(userId: string) {
    const active = await this.db
      .select({ id: classifiedListings.id })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.sellerUserId, userId),
          inArray(classifiedListings.listingType, ["CHO_THUE", "O_GHEP"]),
          eq(classifiedListings.status, "AVAILABLE"),
        ),
      )
      .limit(1);

    if (active[0]) {
      throw new PickiError(
        "CONFLICT",
        "Bạn đang có tin cho thuê/ở ghép đang mở — xóa hoặc chờ hết hạn rồi đăng tin khác",
      );
    }

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const createdThisMonth = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.sellerUserId, userId),
          inArray(classifiedListings.listingType, ["CHO_THUE", "O_GHEP"]),
          gte(classifiedListings.createdAt, start),
        ),
      );

    const count = createdThisMonth[0]?.count ?? 0;
    if (count >= HOUSING_LISTING_MONTHLY_CREATE_LIMIT) {
      throw new PickiError(
        "CONFLICT",
        `Tháng này đã đăng ${String(HOUSING_LISTING_MONTHLY_CREATE_LIMIT)} tin cho thuê/ở ghép — thử lại tháng sau`,
      );
    }
  }

  private async assertLostQuota(userId: string) {
    const active = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.sellerUserId, userId),
          inArray(classifiedListings.listingType, ["LOST_FOUND", "PET_LOST"]),
          eq(classifiedListings.status, "AVAILABLE"),
        ),
      );

    const activeCount = active[0]?.count ?? 0;
    if (activeCount >= LOST_LISTING_ACTIVE_LIMIT) {
      throw new PickiError(
        "CONFLICT",
        `Bạn đang có ${String(LOST_LISTING_ACTIVE_LIMIT)} tin thất lạc đang mở — ẩn tin cũ rồi đăng tiếp`,
      );
    }

    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);

    const createdThisMonth = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(classifiedListings)
      .where(
        and(
          eq(classifiedListings.sellerUserId, userId),
          inArray(classifiedListings.listingType, ["LOST_FOUND", "PET_LOST"]),
          gte(classifiedListings.createdAt, start),
        ),
      );

    const count = createdThisMonth[0]?.count ?? 0;
    if (count >= LOST_LISTING_MONTHLY_CREATE_LIMIT) {
      throw new PickiError(
        "CONFLICT",
        `Tháng này đã đăng ${String(LOST_LISTING_MONTHLY_CREATE_LIMIT)} tin thất lạc — thử lại tháng sau`,
      );
    }
  }

  private async loadListing(listingId: string) {
    const rows = await this.db
      .select()
      .from(classifiedListings)
      .where(eq(classifiedListings.id, listingId))
      .limit(1);
    if (!rows[0]) {
      throw new PickiError("NOT_FOUND", "Listing not found");
    }
    return rows[0];
  }

  private async loadUserDisplay(userId: string) {
    const rows = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  private async assertZoneMember(userId: string, zoneId: string) {
    const membership = await this.db
      .select()
      .from(userZoneMemberships)
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.zoneId, zoneId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      )
      .limit(1);
    if (!membership[0]) {
      throw new PickiError("FORBIDDEN", "Tham gia Zone trước khi dùng GÓC KHU MÌNH");
    }
  }

  private allocateListingNumber(listingType: string): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    const prefix = isHousingListingType(listingType)
      ? "HS"
      : isLostListingType(listingType)
        ? "LF"
        : "CL";
    return `${prefix}-${String(y)}${m}${d}-${suffix}`;
  }

  private photoUrlsFromRow(row: typeof classifiedListings.$inferSelect): string[] {
    const urls = row.photoUrls;
    if (Array.isArray(urls) && urls.every((u) => typeof u === "string")) {
      return urls;
    }
    return row.photoUrl ? [row.photoUrl] : [];
  }

  private toDto(row: typeof classifiedListings.$inferSelect) {
    const photoUrls = this.photoUrlsFromRow(row);
    return {
      id: row.id,
      listingNumber: row.listingNumber,
      zoneId: row.zoneId,
      sellerUserId: row.sellerUserId,
      listingType: row.listingType,
      status: row.status,
      title: row.title,
      description: row.description,
      priceVnd: row.priceVnd,
      condition: row.condition,
      photoUrl: photoUrls[0] ?? null,
      photoUrls,
      locationLabel: row.locationLabel,
      reservedByUserId: row.reservedByUserId,
      reservedAt: row.reservedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}
