import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  VISIT_INTENT_EXPIRE_BUFFER_MINUTES,
  beautyVisitIntents,
  isVisitIntentActive,
  offerings,
  providerLocations,
  providerMembers,
  providers,
  users,
  visitIntentProviderActionToStatus,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { loadProviderBrand, loadUserPhone } from "../orders/order-enrichment.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createVisitIntentSchema, providerVisitIntentActionSchema } from "./dto.js";

@Injectable()
export class VisitIntentsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, input: z.infer<typeof createVisitIntentSchema>) {
    await this.assertCustomerVisitLocation(input.providerLocationId);

    const offering = await this.db
      .select({ id: offerings.id, name: offerings.name })
      .from(offerings)
      .innerJoin(providers, eq(providers.id, offerings.providerId))
      .innerJoin(providerLocations, eq(providerLocations.providerId, providers.id))
      .where(
        and(
          eq(offerings.id, input.offeringId),
          eq(providerLocations.id, input.providerLocationId),
          eq(offerings.status, "ACTIVE"),
        ),
      )
      .limit(1);
    if (!offering[0]) {
      throw new PickiError("VALIDATION_ERROR", "Invalid service");
    }

    const expectedAt = new Date(Date.now() + input.etaMinutes * 60_000);

    const created = await this.db.transaction(async (tx) => {
      const [intent] = await tx
        .insert(beautyVisitIntents)
        .values({
          customerUserId: userId,
          zoneId: input.zoneId,
          providerLocationId: input.providerLocationId,
          offeringId: input.offeringId,
          status: "ACTIVE",
          etaMinutes: input.etaMinutes,
          expectedAt,
        })
        .returning();

      if (!intent) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create visit intent");
      }

      await this.outbox.enqueue(tx, {
        eventType: "visit_intent.created",
        aggregateType: "visit_intent",
        aggregateId: intent.id,
        payload: {
          intentId: intent.id,
          customerUserId: userId,
          providerLocationId: input.providerLocationId,
          offeringName: offering[0]!.name,
          etaMinutes: input.etaMinutes,
          expectedAt: expectedAt.toISOString(),
          actorUserId: userId,
        },
      });

      return intent;
    });

    return this.toDto(created);
  }

  async getMine(userId: string, locationId: string) {
    await this.expireStaleForLocation(locationId);

    const row = await this.db
      .select()
      .from(beautyVisitIntents)
      .where(
        and(
          eq(beautyVisitIntents.customerUserId, userId),
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(beautyVisitIntents.createdAt))
      .limit(1);

    if (!row[0]) return { intent: null };
    return { intent: await this.toDto(row[0]) };
  }

  async cancel(userId: string, intentId: string) {
    const row = await this.db
      .select()
      .from(beautyVisitIntents)
      .where(eq(beautyVisitIntents.id, intentId))
      .limit(1);
    const intent = row[0];
    if (!intent) {
      throw new PickiError("NOT_FOUND", "Visit intent not found");
    }
    if (intent.customerUserId !== userId) {
      throw new PickiError("FORBIDDEN", "Not your visit intent");
    }
    if (!isVisitIntentActive(intent.status)) {
      throw new PickiError("FORBIDDEN", "Intent is no longer active");
    }

    const updated = await this.db.transaction(async (tx) => {
      const [next] = await tx
        .update(beautyVisitIntents)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(beautyVisitIntents.id, intentId))
        .returning();

      if (!next) {
        throw new PickiError("INTERNAL_ERROR", "Failed to cancel intent");
      }

      await this.outbox.enqueue(tx, {
        eventType: "visit_intent.cancelled",
        aggregateType: "visit_intent",
        aggregateId: intentId,
        payload: {
          intentId,
          providerLocationId: next.providerLocationId,
          actorUserId: userId,
        },
      });

      return next;
    });

    return this.toDto(updated);
  }

  async listHistoryForProvider(userId: string, locationId: string, limit = 50) {
    await this.assertLocationAccess(userId, locationId);

    const cappedLimit = Math.min(Math.max(limit, 1), 100);

    const rows = await this.db
      .select()
      .from(beautyVisitIntents)
      .where(
        and(
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.status, "ARRIVED"),
        ),
      )
      .orderBy(desc(beautyVisitIntents.updatedAt))
      .limit(cappedLimit);

    const intents = await Promise.all(rows.map((r) => this.toDto(r)));
    return { intents };
  }

  async listForProvider(userId: string, locationId: string) {
    await this.assertLocationAccess(userId, locationId);
    await this.expireStaleForLocation(locationId);

    const rows = await this.db
      .select()
      .from(beautyVisitIntents)
      .where(
        and(
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.status, "ACTIVE"),
        ),
      )
      .orderBy(beautyVisitIntents.expectedAt);

    const intents = await Promise.all(rows.map((r) => this.toDto(r)));
    const now = Date.now();
    return {
      summary: {
        activeCount: intents.length,
        within30Minutes: intents.filter((i) => {
          const ms = new Date(i.expectedAt).getTime() - now;
          return ms > 0 && ms <= 30 * 60_000;
        }).length,
      },
      intents,
    };
  }

  async providerAction(
    userId: string,
    intentId: string,
    input: z.infer<typeof providerVisitIntentActionSchema>,
  ) {
    const row = await this.db
      .select()
      .from(beautyVisitIntents)
      .where(eq(beautyVisitIntents.id, intentId))
      .limit(1);
    const intent = row[0];
    if (!intent) {
      throw new PickiError("NOT_FOUND", "Visit intent not found");
    }

    await this.assertLocationAccess(userId, intent.providerLocationId);

    if (!isVisitIntentActive(intent.status)) {
      throw new PickiError("FORBIDDEN", "Intent is no longer active");
    }

    if (input.action === "waiting") {
      const now = new Date();
      const brandName = await loadProviderBrand(this.db, intent.providerLocationId);

      const updated = await this.db.transaction(async (tx) => {
        const [next] = await tx
          .update(beautyVisitIntents)
          .set({ shopWaitingAt: now, updatedAt: now })
          .where(eq(beautyVisitIntents.id, intentId))
          .returning();

        if (!next) {
          throw new PickiError("INTERNAL_ERROR", "Failed to update intent");
        }

        await this.outbox.enqueue(tx, {
          eventType: "visit_intent.shop_waiting",
          aggregateType: "visit_intent",
          aggregateId: intentId,
          payload: {
            intentId,
            customerUserId: next.customerUserId,
            providerLocationId: next.providerLocationId,
            providerBrandName: brandName,
            actorUserId: userId,
          },
        });

        return next;
      });

      return this.toDto(updated);
    }

    const toStatus = visitIntentProviderActionToStatus(input.action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action");
    }

    if (input.action === "dismiss") {
      const reason = input.reason?.trim();
      if (!reason) {
        throw new PickiError("VALIDATION_ERROR", "Nhập lý do từ chối");
      }
      const brandName = await loadProviderBrand(this.db, intent.providerLocationId);

      const updated = await this.db.transaction(async (tx) => {
        const [next] = await tx
          .update(beautyVisitIntents)
          .set({
            status: toStatus,
            providerNote: reason,
            updatedAt: new Date(),
          })
          .where(eq(beautyVisitIntents.id, intentId))
          .returning();

        if (!next) {
          throw new PickiError("INTERNAL_ERROR", "Failed to update intent");
        }

        await this.outbox.enqueue(tx, {
          eventType: "visit_intent.provider_rejected",
          aggregateType: "visit_intent",
          aggregateId: intentId,
          payload: {
            intentId,
            customerUserId: next.customerUserId,
            providerLocationId: next.providerLocationId,
            providerBrandName: brandName,
            reason,
            actorUserId: userId,
          },
        });

        return next;
      });

      return this.toDto(updated);
    }

    const [updated] = await this.db
      .update(beautyVisitIntents)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(beautyVisitIntents.id, intentId))
      .returning();

    if (!updated) {
      throw new PickiError("INTERNAL_ERROR", "Failed to update intent");
    }

    return this.toDto(updated);
  }

  private async expireStaleForLocation(locationId: string) {
    const cutoff = new Date(Date.now() - VISIT_INTENT_EXPIRE_BUFFER_MINUTES * 60_000);
    await this.db
      .update(beautyVisitIntents)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(
        and(
          eq(beautyVisitIntents.providerLocationId, locationId),
          eq(beautyVisitIntents.status, "ACTIVE"),
          lt(beautyVisitIntents.expectedAt, cutoff),
        ),
      );
  }

  private async toDto(intent: typeof beautyVisitIntents.$inferSelect) {
    let offeringName: string | null = null;
    if (intent.offeringId) {
      const offering = await this.db
        .select({ name: offerings.name })
        .from(offerings)
        .where(eq(offerings.id, intent.offeringId))
        .limit(1);
      offeringName = offering[0]?.name ?? null;
    }

    const customer = await this.db
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, intent.customerUserId))
      .limit(1);

    const customerPhone = await loadUserPhone(this.db, intent.customerUserId);

    const expiresAt = new Date(
      intent.expectedAt.getTime() + VISIT_INTENT_EXPIRE_BUFFER_MINUTES * 60_000,
    );

    return {
      id: intent.id,
      status: intent.status,
      offeringId: intent.offeringId,
      offeringName,
      etaMinutes: intent.etaMinutes,
      expectedAt: intent.expectedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      shopWaitingAt: intent.shopWaitingAt?.toISOString() ?? null,
      customer: {
        displayName: customer[0]?.displayName ?? "Khách",
        phone: customerPhone,
      },
      createdAt: intent.createdAt.toISOString(),
      updatedAt: intent.updatedAt.toISOString(),
      arrivedAt: intent.status === "ARRIVED" ? intent.updatedAt.toISOString() : null,
    };
  }

  private async assertCustomerVisitLocation(locationId: string) {
    const location = await this.db
      .select({ providerType: providers.providerType })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    const type = location[0]?.providerType;
    if (
      !type ||
      (type !== "BEAUTY" &&
        type !== "PET_SERVICE" &&
        type !== "AUTO_SERVICE" &&
        type !== "HEALTH_PROVIDER")
    ) {
      throw new PickiError("NOT_FOUND", "Visit provider not found");
    }
  }

  private async assertLocationAccess(userId: string, locationId: string) {
    const location = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!location[0]) {
      throw new PickiError("NOT_FOUND", "Location not found");
    }

    const member = await this.db
      .select({ id: providerMembers.id })
      .from(providerMembers)
      .where(
        and(
          eq(providerMembers.userId, userId),
          eq(providerMembers.providerId, location[0].providerId),
        ),
      )
      .limit(1);
    if (!member[0]) {
      throw new PickiError("FORBIDDEN", "No access to this location");
    }
  }
}
