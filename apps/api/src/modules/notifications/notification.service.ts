import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  notifications,
  providerLocations,
  providerMembers,
  pushSubscriptions,
  runners,
  type PickiDb,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import {
  configureWebPush,
  sendWebPush,
} from "../../integrations/notifications/push.adapter.js";
import type { PickiConfig } from "../../shared/config.js";
import { PICKI_CONFIG, PICKI_DB } from "../../shared/tokens.js";

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
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);
  private pushEnabled = false;

  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_CONFIG) private readonly config: PickiConfig,
  ) {}

  onModuleInit(): void {
    this.pushEnabled = configureWebPush(this.config);
    if (this.pushEnabled) {
      this.logger.log("Web Push enabled");
    }
  }

  getVapidPublicKey() {
    return {
      enabled: this.pushEnabled,
      publicKey: this.config.vapidPublicKey,
    };
  }

  async subscribePush(
    userId: string,
    input: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
  ) {
    await this.db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: input.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpoint],
        set: {
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: input.userAgent ?? null,
        },
      });
    return { ok: true };
  }

  async unsubscribePush(userId: string, endpoint: string) {
    await this.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
    return { ok: true };
  }

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

    await this.deliver(Array.from(recipients), base);
  }

  async processSeekingRunner(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    zoneId: string;
  }): Promise<void> {
    const runners = await this.runnersInZone(payload.zoneId);
    await this.deliver([payload.customerUserId, ...runners], {
      eventType: "order.seeking_runner",
      channel: "WEB",
      title: `${payload.orderNumber}: Quán đang tìm runner`,
      body: "Runner có thể nhận giao ngay trên app Runner.",
      payload: { orderId: payload.orderId, orderNumber: payload.orderNumber },
    });
  }

  async processProviderHandoff(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    runnerUserId: string;
  }): Promise<void> {
    await this.deliver([payload.customerUserId, payload.runnerUserId], {
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
    await this.deliver([payload.customerUserId], {
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

    await this.deliver(
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

  private async deliver(
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

    await this.deliverPush(unique, input);
  }

  async sendTestPush(userId: string) {
    if (this.config.nodeEnv === "production") {
      throw new PickiError("FORBIDDEN", "Test push not available in production");
    }
    if (!this.pushEnabled) {
      throw new PickiError("FORBIDDEN", "Web Push not configured — set VAPID_* in .env");
    }
    await this.deliverPush([userId], {
      eventType: "test.push",
      title: "Picki Runner — test push",
      body: "Thông báo nền hoạt động. Bấm để mở app Runner.",
      payload: {},
    });
    return { ok: true };
  }

  private pushUrl(eventType: string, payload: Record<string, unknown>): string {
    if (
      eventType === "order.seeking_runner" ||
      eventType === "order.provider_handoff" ||
      eventType === "test.push"
    ) {
      return "/runner";
    }
    if (eventType === "message.received" || eventType.startsWith("order.") || eventType.startsWith("runner.")) {
      const orderId = payload.orderId;
      if (typeof orderId === "string") return `/orders/${orderId}`;
    }
    return "/";
  }

  private async deliverPush(
    userIds: string[],
    input: { eventType: string; title: string; body: string; payload: Record<string, unknown> },
  ) {
    if (!this.pushEnabled) return;

    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(inArray(pushSubscriptions.userId, userIds));

    const url = this.pushUrl(input.eventType, input.payload);
    const tag = `${input.eventType}:${String(input.payload.orderId ?? input.payload.messageId ?? Date.now())}`;

    for (const sub of subs) {
      try {
        await sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title: input.title, body: input.body, url, tag },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        } else {
          this.logger.warn(`Push failed for ${sub.endpoint.slice(0, 40)}…`);
        }
      }
    }
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
