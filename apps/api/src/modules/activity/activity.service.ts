import { Inject, Injectable } from "@nestjs/common";
import { desc, eq, inArray } from "drizzle-orm";
import {
  beautyVisitIntents,
  offerings,
  orderItems,
  orders,
  providerLocations,
  providers,
  serviceRequests,
  type PickiDb,
} from "@picki/db";
import { PICKI_DB } from "../../shared/tokens.js";
import { isDaypartMenuOrder } from "@picki/shared";

const ORDER_FINISHED = new Set([
  "DELIVERED",
  "COMPLETED",
  "PROVIDER_REJECTED",
  "CUSTOMER_CANCELLED",
  "SYSTEM_CANCELLED",
]);

const SR_ACTIVE = new Set(["OPEN", "CONFIRMED", "UPCOMING", "IN_PROGRESS"]);
const SR_DONE = new Set(["COMPLETED", "PROVIDER_REJECTED", "CANCELLED"]);

export type ActivityBucket = "active" | "upcoming" | "done";

export type ActivityItem = {
  id: string;
  kind: "order" | "service_request" | "visit_intent";
  bucket: ActivityBucket;
  title: string;
  statusLabel: string;
  detail: string | null;
  amountVnd: number | null;
  href: string;
  createdAt: string;
  sortAt: string;
  meta: {
    orderNumber?: string;
    requestNumber?: string;
    orderKind?: string;
    serviceVertical?: string;
    expectedAt?: string;
  };
};

@Injectable()
export class ActivityService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async listMine(userId: string): Promise<{ items: ActivityItem[]; activeCount: number }> {
    const [orderRows, requestRows, intentRows] = await Promise.all([
      this.loadOrders(userId),
      this.loadRequests(userId),
      this.loadVisitIntents(userId),
    ]);

    const items = [...orderRows, ...requestRows, ...intentRows].sort((a, b) =>
      a.sortAt < b.sortAt ? 1 : a.sortAt > b.sortAt ? -1 : 0,
    );

    const activeCount = items.filter((i) => i.bucket === "active" || i.bucket === "upcoming").length;
    return { items, activeCount };
  }

  private async loadOrders(userId: string): Promise<ActivityItem[]> {
    const rows = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        serviceVertical: orders.serviceVertical,
        orderKind: orders.orderKind,
        serviceDate: orders.serviceDate,
        totalVnd: orders.totalVnd,
        providerLocationId: orders.providerLocationId,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        brandName: providers.brandName,
      })
      .from(orders)
      .innerJoin(providerLocations, eq(providerLocations.id, orders.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(orders.customerUserId, userId))
      .orderBy(desc(orders.createdAt))
      .limit(40);

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const items = await this.db
      .select({
        orderId: orderItems.orderId,
        name: orderItems.name,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids));

    const byOrder = new Map<string, string[]>();
    for (const it of items) {
      const list = byOrder.get(it.orderId) ?? [];
      list.push(`${it.name}×${String(it.quantity)}`);
      byOrder.set(it.orderId, list);
    }

    const today = new Date().toISOString().slice(0, 10);

    return rows.map((r) => {
      const finished = ORDER_FINISHED.has(r.status);
      const isPreorder =
        (r.orderKind === "FAMILY_DINNER" ||
          isDaypartMenuOrder(r.orderKind) ||
          r.orderKind === "LATE_DINNER") &&
        r.serviceDate != null &&
        r.serviceDate > today &&
        !finished;

      let bucket: ActivityBucket = finished ? "done" : "active";
      if (isPreorder) bucket = "upcoming";

      const detailParts = byOrder.get(r.id)?.slice(0, 3) ?? [];
      return {
        id: r.id,
        kind: "order" as const,
        bucket,
        title: r.brandName ?? "Đơn hàng",
        statusLabel: orderStatusShort(r.status, r.orderKind, r.serviceVertical),
        detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
        amountVnd: r.totalVnd,
        href: `/orders/${r.id}`,
        createdAt: r.createdAt.toISOString(),
        sortAt: r.updatedAt.toISOString(),
        meta: {
          orderNumber: r.orderNumber,
          orderKind: r.orderKind,
          serviceVertical: r.serviceVertical,
        },
      };
    });
  }

  private async loadRequests(userId: string): Promise<ActivityItem[]> {
    const rows = await this.db
      .select({
        id: serviceRequests.id,
        requestNumber: serviceRequests.requestNumber,
        status: serviceRequests.status,
        offeringId: serviceRequests.offeringId,
        preferredAt: serviceRequests.preferredAt,
        createdAt: serviceRequests.createdAt,
        updatedAt: serviceRequests.updatedAt,
        brandName: providers.brandName,
        providerType: providers.providerType,
      })
      .from(serviceRequests)
      .innerJoin(providerLocations, eq(providerLocations.id, serviceRequests.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(serviceRequests.customerUserId, userId))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(40);

    const offeringIds = rows.map((r) => r.offeringId).filter((id): id is string => Boolean(id));
    const offeringNames = new Map<string, string>();
    if (offeringIds.length > 0) {
      const offs = await this.db
        .select({ id: offerings.id, name: offerings.name })
        .from(offerings)
        .where(inArray(offerings.id, offeringIds));
      for (const o of offs) offeringNames.set(o.id, o.name);
    }

    const now = Date.now();
    return rows
      .filter((r) => SR_ACTIVE.has(r.status) || SR_DONE.has(r.status))
      .map((r) => {
        let bucket: ActivityBucket = SR_DONE.has(r.status) ? "done" : "active";
        if (
          !SR_DONE.has(r.status) &&
          (r.status === "UPCOMING" || r.status === "CONFIRMED") &&
          r.preferredAt &&
          r.preferredAt.getTime() > now
        ) {
          bucket = "upcoming";
        }

        return {
          id: r.id,
          kind: "service_request" as const,
          bucket,
          title: r.brandName ?? "Yêu cầu dịch vụ",
          statusLabel: requestStatusShort(r.status, r.providerType),
          detail: r.offeringId ? (offeringNames.get(r.offeringId) ?? null) : null,
          amountVnd: null,
          href: `/requests/${r.id}`,
          createdAt: r.createdAt.toISOString(),
          sortAt: r.updatedAt.toISOString(),
          meta: { requestNumber: r.requestNumber },
        };
      });
  }

  private async loadVisitIntents(userId: string): Promise<ActivityItem[]> {
    const rows = await this.db
      .select({
        id: beautyVisitIntents.id,
        status: beautyVisitIntents.status,
        etaMinutes: beautyVisitIntents.etaMinutes,
        expectedAt: beautyVisitIntents.expectedAt,
        shopWaitingAt: beautyVisitIntents.shopWaitingAt,
        offeringId: beautyVisitIntents.offeringId,
        providerLocationId: beautyVisitIntents.providerLocationId,
        createdAt: beautyVisitIntents.createdAt,
        updatedAt: beautyVisitIntents.updatedAt,
        brandName: providers.brandName,
      })
      .from(beautyVisitIntents)
      .innerJoin(providerLocations, eq(providerLocations.id, beautyVisitIntents.providerLocationId))
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(beautyVisitIntents.customerUserId, userId))
      .orderBy(desc(beautyVisitIntents.createdAt))
      .limit(40);

    const offeringIds = rows.map((r) => r.offeringId).filter((id): id is string => Boolean(id));
    const offeringNames = new Map<string, string>();
    if (offeringIds.length > 0) {
      const offs = await this.db
        .select({ id: offerings.id, name: offerings.name })
        .from(offerings)
        .where(inArray(offerings.id, offeringIds));
      for (const o of offs) offeringNames.set(o.id, o.name);
    }

    const now = Date.now();
    return rows.map((r) => {
      const done = r.status !== "ACTIVE";
      let bucket: ActivityBucket = done ? "done" : "active";
      if (!done && r.expectedAt.getTime() > now) {
        bucket = "upcoming";
      }

      let statusLabel = "Đã báo sắp tới";
      if (r.shopWaitingAt) statusLabel = "Tiệm đang chờ bạn";
      if (r.status === "ARRIVED") statusLabel = "Đã tới";
      if (r.status === "CANCELLED") statusLabel = "Đã hủy";
      if (r.status === "EXPIRED") statusLabel = "Hết hạn";

      return {
        id: r.id,
        kind: "visit_intent" as const,
        bucket,
        title: r.brandName ?? "Sắp tới tiệm",
        statusLabel,
        detail: r.offeringId
          ? (offeringNames.get(r.offeringId) ?? `~${String(r.etaMinutes)} phút`)
          : `~${String(r.etaMinutes)} phút`,
        amountVnd: null,
        href: `/locations/${r.providerLocationId}`,
        createdAt: r.createdAt.toISOString(),
        sortAt: r.updatedAt.toISOString(),
        meta: { expectedAt: r.expectedAt.toISOString() },
      };
    });
  }
}

function orderStatusShort(status: string, orderKind: string, vertical: string): string {
  if (orderKind === "FAMILY_DINNER") {
    if (status === "CREATED" || status === "PAID" || status === "PAYMENT_PENDING") return "Bữa tối · chờ xác nhận";
    if (!ORDER_FINISHED.has(status)) return "Bữa tối · đang xử lý";
  }
  if (orderKind === "BREAKFAST_PREORDER") {
    if (!ORDER_FINISHED.has(status)) return "Sáng mai · đã đặt";
  }
  if (orderKind === "LUNCH") {
    if (!ORDER_FINISHED.has(status)) return "Bữa trưa · đã đặt";
  }
  if (vertical === "LAUNDRY") {
    switch (status) {
      case "AT_SHOP":
        return "Giặt · đồ đã về tiệm";
      case "PROCESSING":
        return "Giặt · đang xử lý";
      case "READY_FOR_RETURN":
        return "Giặt · sẵn sàng giao lại";
      case "RETURN_DELIVERING":
        return "Giặt · đang giao về";
      default:
        break;
    }
  }
  switch (status) {
    case "CREATED":
    case "PAYMENT_PENDING":
    case "PAID":
      return "Chờ quán xác nhận";
    case "PROVIDER_ACCEPTED":
    case "PREPARING":
      return "Quán đang làm";
    case "READY":
      return "Sẵn sàng lấy";
    case "RUNNER_ASSIGNED":
    case "PICKED_UP":
    case "DELIVERING":
      return "Đang giao";
    case "DELIVERED":
    case "COMPLETED":
      return "Hoàn tất";
    case "PROVIDER_REJECTED":
      return "Đơn hàng bị từ chối";
    case "CUSTOMER_CANCELLED":
    case "SYSTEM_CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}

function requestStatusShort(status: string, providerType: string | null): string {
  const edu = providerType === "EDUCATION_PROVIDER" || providerType === "TUTOR";
  const sports = providerType === "SPORTS_FACILITY";
  switch (status) {
    case "OPEN":
      return edu ? "Chờ phản hồi" : sports ? "Chờ sân xác nhận" : "Chờ phản hồi";
    case "CONFIRMED":
      return edu ? "Đã nhận" : sports ? "Đã giữ chỗ" : "Đã nhận";
    case "UPCOMING":
      return "Sắp tới";
    case "IN_PROGRESS":
      return "Đang thực hiện";
    case "COMPLETED":
      return "Hoàn tất";
    case "PROVIDER_REJECTED":
      return "Từ chối";
    case "CANCELLED":
      return "Đã hủy";
    default:
      return status;
  }
}
