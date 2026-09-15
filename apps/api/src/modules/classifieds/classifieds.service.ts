import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  canClassifiedTransition,
  classifiedCompleteStatus,
  classifiedListings,
  classifiedReservations,
  isClassifiedBrowsable,
  userZoneMemberships,
  users,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createClassifiedSchema, listClassifiedsQuerySchema } from "./dto.js";

@Injectable()
export class ClassifiedsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, input: z.infer<typeof createClassifiedSchema>) {
    await this.assertZoneMember(userId, input.zoneId);

    if (input.listingType === "GIVE_AWAY" && input.priceVnd != null && input.priceVnd > 0) {
      throw new PickiError("VALIDATION_ERROR", "Cho tặng không cần giá");
    }
    if (input.listingType === "RESALE" && (input.priceVnd == null || input.priceVnd <= 0)) {
      throw new PickiError("VALIDATION_ERROR", "Nhập giá bán");
    }

    const listingNumber = await this.allocateListingNumber();

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
          priceVnd: input.listingType === "GIVE_AWAY" ? null : (input.priceVnd ?? null),
          condition: input.condition ?? null,
          photoUrl: input.photoUrls?.[0] ?? null,
          photoUrls: input.photoUrls ?? [],
          locationLabel: input.locationLabel.trim(),
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

    const resaleCount = rows.find((r) => r.listingType === "RESALE")?.count ?? 0;
    const giveAwayCount = rows.find((r) => r.listingType === "GIVE_AWAY")?.count ?? 0;

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
      resaleCount,
      giveAwayCount,
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

    if (!isClassifiedBrowsable(row.status) && row.sellerUserId !== userId && row.reservedByUserId !== userId) {
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

  private async allocateListingNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `CL-${String(y)}${m}${d}-${suffix}`;
  }

  private photoUrlsFromRow(row: typeof classifiedListings.$inferSelect): string[] {
    const urls = row.photoUrls;
    if (Array.isArray(urls) && urls.every((u) => typeof u === "string")) {
      return urls as string[];
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
      createdAt: row.createdAt.toISOString(),
    };
  }
}
