import { Inject, Injectable } from "@nestjs/common";
import { count, desc, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  canAdminSystemCancel,
  orders,
  providerLocations,
  providerZoneMemberships,
  providers,
  runners,
  userZoneMemberships,
  zones,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";
import { OrderTransitionService } from "../orders/order-transition.service.js";
import type { z } from "zod";
import type { adminOrderActionSchema } from "./dto.js";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(OrderTransitionService) private readonly transitions: OrderTransitionService,
  ) {}

  async dashboard() {
    const [orderStats] = await this.db
      .select({
        total: count(),
        active: sql<number>`count(*) filter (where ${orders.status} not in ('DELIVERED', 'CUSTOMER_CANCELLED', 'SYSTEM_CANCELLED', 'PROVIDER_REJECTED', 'PAYMENT_FAILED', 'REFUNDED'))`,
      })
      .from(orders);

    const [memberStats] = await this.db.select({ total: count() }).from(userZoneMemberships);
    const [providerStats] = await this.db.select({ total: count() }).from(providerLocations);
    const [runnerStats] = await this.db
      .select({ total: count() })
      .from(runners)
      .where(eq(runners.status, "ACTIVE"));

    const byStatus = await this.db
      .select({ status: orders.status, total: count() })
      .from(orders)
      .groupBy(orders.status);

    return {
      orders: {
        total: Number(orderStats?.total ?? 0),
        active: Number(orderStats?.active ?? 0),
        byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.total) })),
      },
      members: Number(memberStats?.total ?? 0),
      providerLocations: Number(providerStats?.total ?? 0),
      activeRunners: Number(runnerStats?.total ?? 0),
    };
  }

  async listZones() {
    const rows = await this.db.select().from(zones).orderBy(zones.displayName);
    return {
      zones: await Promise.all(
        rows.map(async (z) => {
          const [members] = await this.db
            .select({ total: count() })
            .from(userZoneMemberships)
            .where(eq(userZoneMemberships.zoneId, z.id));
          const [locs] = await this.db
            .select({ total: count() })
            .from(providerZoneMemberships)
            .where(eq(providerZoneMemberships.zoneId, z.id));
          return {
            id: z.id,
            slug: z.slug,
            displayName: z.displayName,
            status: z.status,
            memberCount: Number(members?.total ?? 0),
            providerLocationCount: Number(locs?.total ?? 0),
          };
        }),
      ),
    };
  }

  async listOrders(limit = 50) {
    const rows = await this.db
      .select({
        order: orders,
        zoneSlug: zones.slug,
        zoneName: zones.displayName,
        locationName: providerLocations.displayName,
        brandName: providers.brandName,
      })
      .from(orders)
      .innerJoin(zones, eq(orders.zoneId, zones.id))
      .innerJoin(providerLocations, eq(orders.providerLocationId, providerLocations.id))
      .innerJoin(providers, eq(providerLocations.providerId, providers.id))
      .orderBy(desc(orders.createdAt))
      .limit(Math.min(limit, 100));

    return {
      orders: rows.map((r) => ({
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        status: r.order.status,
        totalVnd: r.order.totalVnd,
        paymentMode: r.order.paymentMode,
        zone: { slug: r.zoneSlug, displayName: r.zoneName },
        provider: { brandName: r.brandName, locationName: r.locationName },
        delivery: {
          building: r.order.deliveryBuilding,
          apartment: r.order.deliveryApartment,
        },
        createdAt: r.order.createdAt.toISOString(),
      })),
    };
  }

  async applyOrderAction(
    adminUserId: string,
    orderId: string,
    input: z.infer<typeof adminOrderActionSchema>,
  ) {
    const row = await this.db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    const order = row[0];
    if (!order) {
      throw new PickiError("NOT_FOUND", "Order not found");
    }

    if (input.action === "cancel") {
      if (!canAdminSystemCancel(order.status)) {
        throw new PickiError("FORBIDDEN", `Cannot cancel order in status ${order.status}`);
      }

      const result = await this.transitions.adminTransition(
        orderId,
        "SYSTEM_CANCELLED",
        adminUserId,
        input.reason ? `Admin: ${input.reason}` : "Admin cancel",
      );

      await this.db.insert(auditLogs).values({
        actorUserId: adminUserId,
        action: "ORDER_CANCEL",
        entityType: "order",
        entityId: orderId,
        metadata: { fromStatus: order.status, reason: input.reason ?? null },
      });

      return {
        id: result.order.id,
        orderNumber: result.order.orderNumber,
        status: result.order.status,
      };
    }

    throw new PickiError("VALIDATION_ERROR", "Unknown action");
  }
}
