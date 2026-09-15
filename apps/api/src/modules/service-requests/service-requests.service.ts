import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import {
  canServiceRequestTransition,
  offerings,
  providerLocations,
  providerMembers,
  providers,
  serviceRequestActionToStatus,
  serviceRequests,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { OutboxService } from "../outbox/outbox.service.js";
import { loadServiceRequestContacts } from "../orders/order-enrichment.js";
import { PICKI_DB } from "../../shared/tokens.js";
import type { z } from "zod";
import type { createServiceRequestSchema, providerServiceRequestActionSchema } from "./dto.js";

@Injectable()
export class ServiceRequestsService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async create(userId: string, input: z.infer<typeof createServiceRequestSchema>) {
    const location = await this.db
      .select({
        location: providerLocations,
        provider: providers,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, input.providerLocationId))
      .limit(1);

    const row = location[0];
    if (!row || row.provider.providerType !== "HOME_SERVICE") {
      throw new PickiError("NOT_FOUND", "Home service provider not found");
    }

    if (input.offeringId) {
      const offering = await this.db
        .select({ id: offerings.id })
        .from(offerings)
        .where(
          and(
            eq(offerings.id, input.offeringId),
            eq(offerings.providerId, row.provider.id),
            eq(offerings.status, "ACTIVE"),
          ),
        )
        .limit(1);
      if (!offering[0]) {
        throw new PickiError("VALIDATION_ERROR", "Invalid offering");
      }
    }

    const requestNumber = await this.allocateRequestNumber();

    const created = await this.db.transaction(async (tx) => {
      const [request] = await tx
        .insert(serviceRequests)
        .values({
          requestNumber,
          customerUserId: userId,
          zoneId: input.zoneId,
          providerLocationId: input.providerLocationId,
          offeringId: input.offeringId ?? null,
          status: "OPEN",
          customerNote: input.customerNote?.trim() ?? null,
          preferredAt: input.preferredAt ? new Date(input.preferredAt) : null,
          deliveryBuilding: input.deliveryBuilding ?? null,
          deliveryApartment: input.deliveryApartment ?? null,
          deliveryNote: input.deliveryNote ?? null,
        })
        .returning();

      if (!request) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create service request");
      }

      await this.outbox.enqueue(tx, {
        eventType: "service_request.created",
        aggregateType: "service_request",
        aggregateId: request.id,
        payload: {
          requestId: request.id,
          requestNumber: request.requestNumber,
          customerUserId: userId,
          providerLocationId: input.providerLocationId,
          offeringId: input.offeringId ?? null,
        },
      });

      return request;
    });

    return this.toDto(created);
  }

  async listMine(userId: string) {
    const rows = await this.db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.customerUserId, userId))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(50);

    return { requests: await Promise.all(rows.map((r) => this.toDto(r))) };
  }

  async getMine(userId: string, requestId: string) {
    const row = await this.db
      .select()
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.customerUserId, userId)))
      .limit(1);
    if (!row[0]) {
      throw new PickiError("NOT_FOUND", "Service request not found");
    }
    return this.toDto(row[0]);
  }

  async cancel(userId: string, requestId: string) {
    return this.applyAction(userId, requestId, "cancel", undefined, "customer");
  }

  async listForProvider(userId: string, locationId: string) {
    await this.assertLocationAccess(userId, locationId);

    const rows = await this.db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.providerLocationId, locationId))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(50);

    return { requests: await Promise.all(rows.map((r) => this.toDto(r))) };
  }

  async providerAction(
    userId: string,
    requestId: string,
    input: z.infer<typeof providerServiceRequestActionSchema>,
  ) {
    if (input.action === "reject" && !input.note?.trim()) {
      throw new PickiError("VALIDATION_ERROR", "Vui lòng nhập lý do từ chối");
    }
    return this.applyAction(userId, requestId, input.action, input.note?.trim(), "provider");
  }

  private async applyAction(
    actorUserId: string,
    requestId: string,
    action: "accept" | "reject" | "start" | "complete" | "cancel",
    note: string | undefined,
    actorRole: "customer" | "provider",
  ) {
    const row = await this.db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId))
      .limit(1);
    const request = row[0];
    if (!request) {
      throw new PickiError("NOT_FOUND", "Service request not found");
    }

    if (actorRole === "customer") {
      if (request.customerUserId !== actorUserId) {
        throw new PickiError("FORBIDDEN", "Not your request");
      }
    } else {
      await this.assertLocationAccess(actorUserId, request.providerLocationId);
    }

    const toStatus = serviceRequestActionToStatus(action);
    if (!toStatus) {
      throw new PickiError("VALIDATION_ERROR", "Invalid action");
    }

    if (!canServiceRequestTransition(request.status, toStatus)) {
      throw new PickiError("FORBIDDEN", `Cannot transition ${request.status} → ${toStatus}`);
    }

    if (actorRole === "provider" && action === "reject" && !note) {
      throw new PickiError("VALIDATION_ERROR", "Reject reason required");
    }

    const updated = await this.db.transaction(async (tx) => {
      const [next] = await tx
        .update(serviceRequests)
        .set({
          status: toStatus,
          providerNote: action === "reject" ? note ?? null : request.providerNote,
          updatedAt: new Date(),
        })
        .where(eq(serviceRequests.id, requestId))
        .returning();

      if (!next) {
        throw new PickiError("INTERNAL_ERROR", "Failed to update request");
      }

      const eventType =
        action === "accept"
          ? "service_request.confirmed"
          : action === "reject"
            ? "service_request.rejected"
            : action === "complete"
              ? "service_request.completed"
              : action === "cancel"
                ? "service_request.cancelled"
                : "service_request.updated";

      await this.outbox.enqueue(tx, {
        eventType,
        aggregateType: "service_request",
        aggregateId: requestId,
        payload: {
          requestId,
          requestNumber: next.requestNumber,
          customerUserId: next.customerUserId,
          providerLocationId: next.providerLocationId,
          status: toStatus,
          actorUserId,
        },
      });

      return next;
    });

    return this.toDto(updated);
  }

  private async toDto(request: typeof serviceRequests.$inferSelect) {
    let offeringName: string | null = null;
    if (request.offeringId) {
      const offering = await this.db
        .select({ name: offerings.name })
        .from(offerings)
        .where(eq(offerings.id, request.offeringId))
        .limit(1);
      offeringName = offering[0]?.name ?? null;
    }

    const location = await this.db
      .select({
        brandName: providers.brandName,
        displayName: providerLocations.displayName,
      })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, request.providerLocationId))
      .limit(1);

    const contacts = await loadServiceRequestContacts(this.db, {
      customerUserId: request.customerUserId,
      providerLocationId: request.providerLocationId,
    });

    return {
      id: request.id,
      requestNumber: request.requestNumber,
      status: request.status,
      offeringId: request.offeringId,
      offeringName,
      providerBrandName: location[0]?.brandName ?? null,
      providerDisplayName: location[0]?.displayName ?? null,
      customerNote: request.customerNote,
      providerNote: request.providerNote,
      preferredAt: request.preferredAt?.toISOString() ?? null,
      deliveryBuilding: request.deliveryBuilding,
      deliveryApartment: request.deliveryApartment,
      deliveryNote: request.deliveryNote,
      contacts,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
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

  private async allocateRequestNumber(): Promise<string> {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `SR-${String(y)}${m}${d}-${suffix}`;
  }
}
