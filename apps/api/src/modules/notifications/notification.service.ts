import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  notifications,
  providerLocations,
  providerMembers,
  runners,
  type PickiDb,
} from "@picki/db";
import { PICKI_DB } from "../../shared/tokens.js";

type OrderStatusPayload = {
  orderId: string;
  orderNumber: string;
  customerUserId: string;
  providerLocationId: string;
  zoneId: string;
  runnerUserId: string | null;
  fromStatus: string | null;
  toStatus: string;
};

type MessagePayload = {
  conversationId: string;
  messageId: string;
  senderUserId: string;
  orderId?: string;
  orderNumber?: string;
  preview: string;
  recipientUserIds: string[];
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "Đơn mới",
  PAYMENT_PENDING: "Chờ thanh toán",
  PAID: "Đã thanh toán",
  PROVIDER_ACCEPTED: "Quán đã nhận — đang tìm runner",
  RUNNER_ASSIGNED: "Runner đã nhận — chờ quán nấu",
  PREPARING: "Đang nấu",
  READY: "Sẵn sàng giao",
  PICKED_UP: "Runner đã lấy hàng",
  DELIVERING: "Đang giao",
  DELIVERED: "Đã giao",
  PROVIDER_REJECTED: "Quán từ chối",
  CUSTOMER_CANCELLED: "Khách hủy",
  SYSTEM_CANCELLED: "Hệ thống hủy",
  PAYMENT_FAILED: "Thanh toán thất bại",
};

@Injectable()
export class NotificationService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async listForUser(userId: string, limit = 30) {
    const rows = await this.db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    const unread = rows.filter((r) => r.readAt == null).length;

    return {
      unreadCount: unread,
      notifications: rows.map((n) => ({
        id: n.id,
        eventType: n.eventType,
        title: n.title,
        body: n.body,
        payload: n.payload,
        read: n.readAt != null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markRead(userId: string, notificationId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return { ok: true };
  }

  async processOrderStatusChanged(payload: OrderStatusPayload): Promise<void> {
    const label = ORDER_STATUS_LABELS[payload.toStatus] ?? payload.toStatus;
    const title = `${payload.orderNumber}: ${label}`;
    const body = `Trạng thái đơn hàng cập nhật — ${label}.`;
    const base = {
      eventType: "order.status_changed",
      channel: "WEB" as const,
      title,
      body,
      payload: {
        orderId: payload.orderId,
        orderNumber: payload.orderNumber,
        status: payload.toStatus,
      },
    };

    const recipients = new Set<string>();

    if (payload.toStatus === "CREATED" || payload.toStatus === "PAID") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      staff.forEach((id) => recipients.add(id));
    }

    if (
      payload.toStatus !== "CREATED" &&
      !["PAYMENT_PENDING", "PAYMENT_FAILED"].includes(payload.toStatus)
    ) {
      recipients.add(payload.customerUserId);
    }

    if (payload.toStatus === "PROVIDER_ACCEPTED") {
      const zoneRunners = await this.runnersInZone(payload.zoneId);
      zoneRunners.forEach((id) => recipients.add(id));
    }

    if (payload.toStatus === "RUNNER_ASSIGNED") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      staff.forEach((id) => recipients.add(id));
      if (payload.runnerUserId) recipients.add(payload.runnerUserId);
    }

    if (payload.runnerUserId && ["PICKED_UP", "DELIVERING"].includes(payload.toStatus)) {
      recipients.add(payload.runnerUserId);
    }

    if (["PROVIDER_REJECTED", "SYSTEM_CANCELLED", "CUSTOMER_CANCELLED"].includes(payload.toStatus)) {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      staff.forEach((id) => recipients.add(id));
    }

    await this.deliverWeb(Array.from(recipients), base);
  }

  async processProviderHandoff(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    runnerUserId: string;
  }): Promise<void> {
    await this.deliverWeb([payload.customerUserId, payload.runnerUserId], {
      eventType: "order.provider_handoff",
      channel: "WEB",
      title: `${payload.orderNumber}: Quán đã giao cho runner`,
      body: "Runner có thể xác nhận đã nhận hàng tại quán.",
      payload: { orderId: payload.orderId, orderNumber: payload.orderNumber },
    });
  }

  async processRunnerArrivedLobby(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
  }): Promise<void> {
    await this.deliverWeb([payload.customerUserId], {
      eventType: "runner.arrived_lobby",
      channel: "WEB",
      title: `${payload.orderNumber}: Runner đã đến sảnh`,
      body: "Runner đang chờ bạn xuống nhận hàng.",
      payload: { orderId: payload.orderId, orderNumber: payload.orderNumber },
    });
  }

  async processMessageReceived(payload: MessagePayload): Promise<void> {
    const title = payload.orderNumber
      ? `Tin nhắn đơn ${payload.orderNumber}`
      : "Tin nhắn mới";
    const preview =
      payload.preview.length > 120 ? `${payload.preview.slice(0, 117)}…` : payload.preview;

    await this.deliverWeb(
      payload.recipientUserIds.filter((id) => id !== payload.senderUserId),
      {
        eventType: "message.received",
        channel: "WEB",
        title,
        body: preview,
        payload: {
          conversationId: payload.conversationId,
          messageId: payload.messageId,
          orderId: payload.orderId,
        },
      },
    );
  }

  private async deliverWeb(
    userIds: string[],
    input: {
      eventType: string;
      channel: "WEB";
      title: string;
      body: string;
      payload: Record<string, unknown>;
    },
  ) {
    const unique = [...new Set(userIds)].filter(Boolean);
    if (unique.length === 0) return;

    await this.db.insert(notifications).values(
      unique.map((userId) => ({
        userId,
        channel: input.channel,
        eventType: input.eventType,
        title: input.title,
        body: input.body,
        payload: input.payload,
      })),
    );
  }

  private async providerStaffForLocation(locationId: string): Promise<string[]> {
    const location = await this.db
      .select({ providerId: providerLocations.providerId })
      .from(providerLocations)
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    if (!location[0]) return [];

    const rows = await this.db
      .select({ userId: providerMembers.userId })
      .from(providerMembers)
      .where(
        and(
          eq(providerMembers.providerId, location[0].providerId),
          or(
            eq(providerMembers.providerLocationId, locationId),
            isNull(providerMembers.providerLocationId),
          ),
        ),
      );
    return rows.map((r) => r.userId);
  }

  private async runnersInZone(zoneId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: runners.userId })
      .from(runners)
      .where(and(eq(runners.zoneId, zoneId), eq(runners.status, "ACTIVE")));
    return rows.map((r) => r.userId);
  }
}
