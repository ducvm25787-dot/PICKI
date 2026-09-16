import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  HEALTH_FOLLOWUP_MAX_DAYS,
  beautyVisitIntents,
  healthFollowupReminders,
  isHealthFollowupLocked,
  isHealthFollowupPending,
  remindAtFromDays,
  providerLocations,
  providerMembers,
  providers,
  users,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { loadUserPhone } from "../orders/order-enrichment.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createHealthFollowupSchema } from "./dto.js";

const UNIQUE_VIOLATION = "23505";

@Injectable()
export class HealthFollowupsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  /** Khách đã từng tới khám — nguồn duy nhất để đặt nhắc tái khám. */
  async listPatients(userId: string, locationId: string) {
    await this.assertClinicAccess(userId, locationId);

    const rows = await this.db
      .select({
        customerUserId: beautyVisitIntents.customerUserId,
        lastVisitAt: sql<string>`max(${beautyVisitIntents.updatedAt})`,
        visitCount: sql<number>`count(*)::int`,
      })
      .from(beautyVisitIntents)
      .where(
        and(
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.status, "ARRIVED"),
        ),
      )
      .groupBy(beautyVisitIntents.customerUserId)
      .orderBy(desc(sql`max(${beautyVisitIntents.updatedAt})`))
      .limit(50);

    if (rows.length === 0) return { patients: [] };

    const names = await this.loadDisplayNames(rows.map((r) => r.customerUserId));
    const lockStatus = await this.loadActiveFollowupStatus(
      locationId,
      rows.map((r) => r.customerUserId),
    );

    const patients = await Promise.all(
      rows.map(async (r) => ({
        customerUserId: r.customerUserId,
        displayName: names.get(r.customerUserId) ?? "Khách",
        phone: await loadUserPhone(this.db, r.customerUserId),
        lastVisitAt: new Date(r.lastVisitAt).toISOString(),
        visitCount: r.visitCount,
        followupStatus: lockStatus.get(r.customerUserId) ?? null,
      })),
    );

    return { patients };
  }

  async listForLocation(userId: string, locationId: string) {
    await this.assertClinicAccess(userId, locationId);

    const rows = await this.db
      .select()
      .from(healthFollowupReminders)
      .where(eq(healthFollowupReminders.providerLocationId, locationId))
      .orderBy(desc(healthFollowupReminders.remindAt))
      .limit(50);

    const names = await this.loadDisplayNames(rows.map((r) => r.customerUserId));

    const reminders = rows.map((r) => ({
      id: r.id,
      status: r.status,
      customerUserId: r.customerUserId,
      customerDisplayName: names.get(r.customerUserId) ?? "Khách",
      remindAt: r.remindAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      summary: {
        pendingCount: reminders.filter((r) => isHealthFollowupPending(r.status)).length,
      },
      reminders,
    };
  }

  async create(userId: string, input: z.infer<typeof createHealthFollowupSchema>) {
    await this.assertClinicAccess(userId, input.locationId);

    if (input.days < 1 || input.days > HEALTH_FOLLOWUP_MAX_DAYS) {
      throw new PickiError("VALIDATION_ERROR", `Chọn từ 1 đến ${String(HEALTH_FOLLOWUP_MAX_DAYS)} ngày`);
    }

    await this.assertVisitedBefore(input.locationId, input.customerUserId);
    await this.assertCanSchedule(input.locationId, input.customerUserId);

    const remindAt = remindAtFromDays(input.days);

    try {
      const [created] = await this.db
        .insert(healthFollowupReminders)
        .values({
          providerLocationId: input.locationId,
          customerUserId: input.customerUserId,
          createdByUserId: userId,
          status: "SCHEDULED",
          remindAt,
        })
        .returning();

      if (!created) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create reminder");
      }

      return {
        id: created.id,
        status: created.status,
        customerUserId: created.customerUserId,
        remindAt: created.remindAt.toISOString(),
        days: input.days,
      };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new PickiError("CONFLICT", "Khách này đã có lời nhắc — chỉ nhắc một lần");
      }
      throw err;
    }
  }

  async cancel(userId: string, reminderId: string) {
    const rows = await this.db
      .select()
      .from(healthFollowupReminders)
      .where(eq(healthFollowupReminders.id, reminderId))
      .limit(1);
    const reminder = rows[0];
    if (!reminder) {
      throw new PickiError("NOT_FOUND", "Không tìm thấy lời nhắc");
    }

    await this.assertClinicAccess(userId, reminder.providerLocationId);

    if (!isHealthFollowupPending(reminder.status)) {
      throw new PickiError("FORBIDDEN", "Lời nhắc đã gửi hoặc đã hủy");
    }

    const [updated] = await this.db
      .update(healthFollowupReminders)
      .set({ status: "CANCELLED", updatedAt: new Date() })
      .where(
        and(
          eq(healthFollowupReminders.id, reminderId),
          eq(healthFollowupReminders.status, "SCHEDULED"),
        ),
      )
      .returning();

    if (!updated) {
      throw new PickiError("CONFLICT", "Lời nhắc vừa thay đổi trạng thái");
    }

    return { id: updated.id, status: updated.status };
  }

  /** Worker gọi: chốt lời nhắc đến hạn và đẩy sang outbox để gửi thông báo. */
  async dispatchDue(limit = 20): Promise<number> {
    const due = await this.db
      .select({ id: healthFollowupReminders.id })
      .from(healthFollowupReminders)
      .where(
        and(
          eq(healthFollowupReminders.status, "SCHEDULED"),
          sql`${healthFollowupReminders.remindAt} <= now()`,
        ),
      )
      .orderBy(healthFollowupReminders.remindAt)
      .limit(limit);

    let sent = 0;
    for (const row of due) {
      const claimed = await this.db.transaction(async (tx) => {
        const now = new Date();
        const [next] = await tx
          .update(healthFollowupReminders)
          .set({ status: "SENT", sentAt: now, updatedAt: now })
          .where(
            and(
              eq(healthFollowupReminders.id, row.id),
              eq(healthFollowupReminders.status, "SCHEDULED"),
            ),
          )
          .returning();

        if (!next) return false;

        await this.outbox.enqueue(tx, {
          eventType: "health.followup_due",
          aggregateType: "health_followup",
          aggregateId: next.id,
          payload: {
            reminderId: next.id,
            customerUserId: next.customerUserId,
            providerLocationId: next.providerLocationId,
          },
        });

        return true;
      });

      if (claimed) sent += 1;
    }

    return sent;
  }

  private async loadActiveFollowupStatus(
    locationId: string,
    customerUserIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(customerUserIds)];
    if (unique.length === 0) return new Map();

    const rows = await this.db
      .select({
        customerUserId: healthFollowupReminders.customerUserId,
        status: healthFollowupReminders.status,
      })
      .from(healthFollowupReminders)
      .where(
        and(
          eq(healthFollowupReminders.providerLocationId, locationId),
          inArray(healthFollowupReminders.customerUserId, unique),
          inArray(healthFollowupReminders.status, ["SCHEDULED", "SENT"]),
        ),
      );

    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.status === "SENT" || !map.has(r.customerUserId)) {
        map.set(r.customerUserId, r.status);
      }
    }
    return map;
  }

  private async loadDisplayNames(userIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return new Map();

    const rows = await this.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, unique));

    return new Map(rows.map((r) => [r.id, r.displayName ?? "Khách"]));
  }

  private async assertCanSchedule(locationId: string, customerUserId: string) {
    const existing = await this.db
      .select({ status: healthFollowupReminders.status })
      .from(healthFollowupReminders)
      .where(
        and(
          eq(healthFollowupReminders.providerLocationId, locationId),
          eq(healthFollowupReminders.customerUserId, customerUserId),
          inArray(healthFollowupReminders.status, ["SCHEDULED", "SENT"]),
        ),
      )
      .limit(1);

    const status = existing[0]?.status;
    if (status && isHealthFollowupLocked(status)) {
      if (status === "SENT") {
        throw new PickiError("CONFLICT", "Đã nhắc khách này rồi — chỉ nhắc một lần");
      }
      throw new PickiError("CONFLICT", "Khách này đang có lời nhắc chờ gửi");
    }
  }

  private async assertVisitedBefore(locationId: string, customerUserId: string) {
    const visited = await this.db
      .select({ id: beautyVisitIntents.id })
      .from(beautyVisitIntents)
      .where(
        and(
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.customerUserId, customerUserId),
          eq(beautyVisitIntents.status, "ARRIVED"),
        ),
      )
      .limit(1);

    if (!visited[0]) {
      throw new PickiError("FORBIDDEN", "Chỉ nhắc khách đã từng tới khám tại phòng khám");
    }
  }

  private async assertClinicAccess(userId: string, locationId: string) {
    const location = await this.db
      .select({
        providerId: providerLocations.providerId,
        providerType: providers.providerType,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);

    const row = location[0];
    if (!row) {
      throw new PickiError("NOT_FOUND", "Location not found");
    }
    if (row.providerType !== "HEALTH_PROVIDER") {
      throw new PickiError("FORBIDDEN", "Chỉ phòng khám dùng được nhắc tái khám");
    }

    const member = await this.db
      .select({ id: providerMembers.id })
      .from(providerMembers)
      .where(and(eq(providerMembers.userId, userId), eq(providerMembers.providerId, row.providerId)))
      .limit(1);
    if (!member[0]) {
      throw new PickiError("FORBIDDEN", "No access to this location");
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}
