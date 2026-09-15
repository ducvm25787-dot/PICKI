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
  actorUserId?: string | null;
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
  PROVIDER_ACCEPTED: "Quán đã nhận đơn",
  RUNNER_ASSIGNED: "Runner đã nhận — chờ quán nấu",
  PREPARING: "Đang nấu",
  READY: "Sẵn sàng giao",
  PICKED_UP: "Runner đã lấy hàng",
  DELIVERING: "Đang giao",
  DELIVERED: "Đã giao",
  AT_SHOP: "Đồ đã về tiệm",
  PROCESSING: "Đang giặt",
  READY_FOR_RETURN: "Sẵn sàng giao lại",
  RETURN_RUNNER_ASSIGNED: "Runner giao lại",
  RETURN_PICKED_UP: "Runner lấy đồ tại tiệm",
  RETURN_DELIVERING: "Đang giao về",
  COMPLETED: "Hoàn tất",
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
    const isRunner = await this.userIsRunner(userId);

    const rows = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.supersededAt)))
      .orderBy(desc(notifications.createdAt))
      .limit(limit * 2);

    const visible = rows.filter((r) => {
      if (r.eventType === "order.seeking_runner" && !isRunner) return false;
      if (r.eventType === "order.runner_sought") return false;
      return true;
    });

    const notificationsOut = visible.slice(0, limit).map((n) => ({
      id: n.id,
      eventType: n.eventType,
      title: n.title,
      body: n.body,
      payload: n.payload,
      read: n.readAt != null,
      createdAt: n.createdAt.toISOString(),
    }));

    const unread = notificationsOut.filter((r) => !r.read).length;

    return {
      unreadCount: unread,
      notifications: notificationsOut,
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
    const eventPayload = {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      status: payload.toStatus,
    };

    const excludeActor = payload.actorUserId ?? null;

    const customerCopy = this.customerNotificationCopy(payload.toStatus, payload.orderNumber, label);
    if (customerCopy) {
      await this.deliver(
        [payload.customerUserId],
        {
          eventType: "order.status_changed",
          channel: "WEB",
          title: customerCopy.title,
          body: customerCopy.body,
          payload: eventPayload,
        },
        { excludeUserId: excludeActor },
      );
    }

    const providerCopy = this.providerNotificationCopy(payload.toStatus, payload.orderNumber, label);
    if (providerCopy) {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      if (staff.length > 0) {
        await this.deliver(
          staff,
          {
            eventType: "order.status_changed",
            channel: "WEB",
            title: providerCopy.title,
            body: providerCopy.body,
            payload: eventPayload,
          },
          { excludeUserId: excludeActor },
        );
      }
    }

    const runnerBody = this.runnerStatusBody(payload.toStatus, label);
    if (runnerBody && payload.runnerUserId) {
      await this.deliver(
        [payload.runnerUserId],
        {
          eventType: "order.status_changed",
          channel: "WEB",
          title: `${payload.orderNumber}: ${label}`,
          body: runnerBody,
          payload: eventPayload,
        },
        { excludeUserId: excludeActor },
      );
    }
  }

  private customerNotificationCopy(
    toStatus: string,
    orderNumber: string,
    label: string,
  ): { title: string; body: string } | null {
    switch (toStatus) {
      case "CREATED":
      case "PAYMENT_PENDING":
      case "PAYMENT_FAILED":
      case "RUNNER_ASSIGNED":
      case "RETURN_RUNNER_ASSIGNED":
      case "CUSTOMER_CANCELLED":
      case "SYSTEM_CANCELLED":
        return null;
      case "PAID":
        return {
          title: `${orderNumber}: Đã thanh toán`,
          body: "Thanh toán thành công — tiệm sẽ xác nhận đơn.",
        };
      case "PROVIDER_ACCEPTED":
        return {
          title: `${orderNumber}: Tiệm đã nhận đơn`,
          body: "Tiệm đã nhận đơn của bạn.",
        };
      case "PROVIDER_REJECTED":
        return {
          title: `${orderNumber}: Tiệm từ chối đơn`,
          body: "Tiệm đã từ chối đơn — xem chi tiết đơn hàng.",
        };
      case "PREPARING":
        return {
          title: `${orderNumber}: Đang chuẩn bị`,
          body: "Quán đang chuẩn bị món.",
        };
      case "READY":
        return {
          title: `${orderNumber}: Sẵn sàng giao`,
          body: "Món đã sẵn sàng — chờ runner lấy hàng.",
        };
      case "READY_FOR_RETURN":
        return {
          title: `${orderNumber}: Chuẩn bị giao`,
          body: "Đồ đã sẵn sàng — tiệm chuẩn bị giao về cho bạn.",
        };
      case "PICKED_UP":
        return {
          title: `${orderNumber}: ${label}`,
          body: "Runner đã lấy hàng tại quán.",
        };
      case "RETURN_PICKED_UP":
        return {
          title: `${orderNumber}: ${label}`,
          body: "Runner đã lấy đồ tại tiệm.",
        };
      case "DELIVERING":
      case "RETURN_DELIVERING":
        return {
          title: `${orderNumber}: Đang giao`,
          body: "Đơn đang được giao.",
        };
      case "DELIVERED":
        return {
          title: `${orderNumber}: Đã giao`,
          body: "Đã giao thành công.",
        };
      case "AT_SHOP":
        return {
          title: `${orderNumber}: ${label}`,
          body: "Đồ đã về tiệm — đang xử lý.",
        };
      case "PROCESSING":
        return {
          title: `${orderNumber}: Đang xử lý`,
          body: "Tiệm đang giặt / xử lý đồ của bạn.",
        };
      case "COMPLETED":
        return {
          title: `${orderNumber}: Hoàn tất`,
          body: "Đơn giặt đã hoàn tất.",
        };
      default:
        return {
          title: `${orderNumber}: ${label}`,
          body: `Trạng thái đơn: ${label}.`,
        };
    }
  }

  /** Tiệm — đơn mới, hủy, runner tiến trình (không nhận tin gọi runner pool). */
  private providerNotificationCopy(
    toStatus: string,
    orderNumber: string,
    label: string,
  ): { title: string; body: string } | null {
    switch (toStatus) {
      case "CREATED":
      case "PAID":
        return {
          title: `${orderNumber}: Đơn mới`,
          body: "Có đơn mới — mở tab Đơn để nhận.",
        };
      case "PROVIDER_ACCEPTED":
      case "PROVIDER_REJECTED":
      case "READY_FOR_RETURN":
        return null;
      case "CUSTOMER_CANCELLED":
        return {
          title: `${orderNumber}: Khách hủy đơn`,
          body: "Khách đã hủy đơn.",
        };
      case "SYSTEM_CANCELLED":
        return {
          title: `${orderNumber}: Hệ thống hủy`,
          body: "Đơn đã bị hủy bởi hệ thống.",
        };
      case "RUNNER_ASSIGNED":
      case "RETURN_RUNNER_ASSIGNED":
        return {
          title: `${orderNumber}: Runner nhận đơn`,
          body: "Runner đã nhận đơn.",
        };
      case "PICKED_UP":
        return {
          title: `${orderNumber}: ${label}`,
          body: "Runner đã lấy hàng tại quán.",
        };
      case "RETURN_PICKED_UP":
        return {
          title: `${orderNumber}: ${label}`,
          body: "Runner đã lấy đồ tại tiệm.",
        };
      case "DELIVERING":
      case "RETURN_DELIVERING":
        return {
          title: `${orderNumber}: Đang giao`,
          body: "Runner đang giao đơn.",
        };
      case "DELIVERED":
        return {
          title: `${orderNumber}: Đã giao`,
          body: "Đơn đã giao xong.",
        };
      case "COMPLETED":
        return {
          title: `${orderNumber}: Hoàn tất`,
          body: "Đơn giặt đã hoàn tất.",
        };
      default:
        return null;
    }
  }

  /** Runner — không nhận thông báo tiến trình do chính mình thực hiện (chỉ pool + handoff). */
  private runnerStatusBody(_toStatus: string, _label: string): string | null {
    return null;
  }

  async processSeekingRunner(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    providerLocationId?: string;
    zoneId: string;
    leg?: "INBOUND" | "RETURN";
    wave?: number;
    runnerUserIds?: string[];
    deliveryFeeVnd?: number;
    actorUserId?: string | null;
  }): Promise<void> {
    const runnerRecipients = payload.runnerUserIds ?? [];
    if (runnerRecipients.length === 0) {
      this.logger.warn(`seeking_runner skipped — no targets for ${payload.orderNumber}`);
      return;
    }

    const feePart =
      payload.deliveryFeeVnd && payload.deliveryFeeVnd > 0
        ? ` Phí giao: ${payload.deliveryFeeVnd.toLocaleString("vi-VN")}đ.`
        : "";

    const basePayload = {
      orderId: payload.orderId,
      orderNumber: payload.orderNumber,
      wave: payload.wave ?? 1,
      leg: payload.leg ?? "INBOUND",
      deliveryFeeVnd: payload.deliveryFeeVnd ?? 0,
    };

    await this.deliver(runnerRecipients, {
      eventType: "order.seeking_runner",
      channel: "WEB",
      title: `${payload.orderNumber}: Đơn giao mới`,
      body: `Mở app Runner để nhận.${feePart}`,
      payload: basePayload,
    });
  }

  async processProviderHandoff(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    runnerUserId: string;
    actorUserId?: string | null;
  }): Promise<void> {
    await this.deliver(
      [payload.customerUserId, payload.runnerUserId],
      {
        eventType: "order.provider_handoff",
        channel: "WEB",
        title: `${payload.orderNumber}: Quán đã giao cho runner`,
        body: "Runner có thể xác nhận đã nhận hàng tại quán.",
        payload: { orderId: payload.orderId, orderNumber: payload.orderNumber },
      },
      { excludeUserId: payload.actorUserId ?? null },
    );
  }

  async processRunnerArrivedLobby(payload: {
    orderId: string;
    orderNumber: string;
    customerUserId: string;
    actorUserId?: string | null;
  }): Promise<void> {
    await this.deliver(
      [payload.customerUserId],
      {
        eventType: "runner.arrived_lobby",
        channel: "WEB",
        title: `${payload.orderNumber}: Runner đã đến sảnh`,
        body: "Runner đang chờ bạn xuống nhận hàng.",
        payload: { orderId: payload.orderId, orderNumber: payload.orderNumber },
      },
      { excludeUserId: payload.actorUserId ?? null },
    );
  }

  async processServiceRequest(
    eventType: string,
    payload: {
      requestId: string;
      requestNumber: string;
      customerUserId: string;
      providerLocationId: string;
      status?: string;
      actorUserId?: string | null;
    },
  ): Promise<void> {
    const basePayload = {
      requestId: payload.requestId,
      requestNumber: payload.requestNumber,
    };
    const excludeActor = payload.actorUserId ?? null;

    if (eventType === "service_request.created") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      if (staff.length > 0) {
        await this.deliver(
          staff,
          {
            eventType,
            channel: "WEB",
            title: `${payload.requestNumber}: Yêu cầu mới`,
            body: "Có yêu cầu dịch vụ — mở tab Yêu cầu để xử lý.",
            payload: basePayload,
          },
          { excludeUserId: excludeActor },
        );
      }
      return;
    }

    const customerCopy: Record<string, { title: string; body: string }> = {
      "service_request.confirmed": {
        title: `${payload.requestNumber}: Thợ đã nhận`,
        body: "Thợ đã nhận yêu cầu — liên hệ qua chat nếu cần.",
      },
      "service_request.rejected": {
        title: `${payload.requestNumber}: Thợ từ chối`,
        body: "Thợ không nhận yêu cầu — xem chi tiết.",
      },
      "service_request.completed": {
        title: `${payload.requestNumber}: Hoàn tất`,
        body: "Dịch vụ đã hoàn tất.",
      },
      "service_request.cancelled": {
        title: `${payload.requestNumber}: Đã hủy`,
        body: "Yêu cầu đã được hủy.",
      },
    };

    const copy = customerCopy[eventType];
    if (copy) {
      await this.deliver(
        [payload.customerUserId],
        {
          eventType,
          channel: "WEB",
          title: copy.title,
          body: copy.body,
          payload: basePayload,
        },
        { excludeUserId: excludeActor },
      );
    }
  }

  async processVisitIntent(
    eventType: string,
    payload: {
      intentId: string;
      providerLocationId: string;
      offeringName?: string;
      etaMinutes?: number;
      expectedAt?: string;
      actorUserId?: string | null;
    },
  ): Promise<void> {
    const excludeActor = payload.actorUserId ?? null;

    if (eventType === "visit_intent.created") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      const eta = payload.etaMinutes != null ? `~${String(payload.etaMinutes)} phút` : "sắp tới";
      const service = payload.offeringName ? ` · ${payload.offeringName}` : "";
      if (staff.length > 0) {
        await this.deliver(
          staff,
          {
            eventType,
            channel: "WEB",
            title: "Khách sắp tới tiệm",
            body: `Có khách báo tới sau ${eta}${service} — mở tab Sắp tới.`,
            payload: { intentId: payload.intentId },
          },
          { excludeUserId: excludeActor },
        );
      }
      return;
    }

    if (eventType === "visit_intent.cancelled") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      if (staff.length > 0) {
        await this.deliver(
          staff,
          {
            eventType,
            channel: "WEB",
            title: "Khách hủy báo sắp tới",
            body: "Khách đã hủy thông báo sắp tới tiệm.",
            payload: { intentId: payload.intentId },
          },
          { excludeUserId: excludeActor },
        );
      }
    }
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
    options?: { excludeUserId?: string | null },
  ) {
    const exclude = options?.excludeUserId ?? null;
    const unique = [...new Set(userIds)].filter(Boolean).filter((id) => id !== exclude);
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
    if (eventType.startsWith("service_request.")) {
      const requestId = payload.requestId;
      if (typeof requestId === "string") return `/requests/${requestId}`;
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
    const wave =
      typeof input.payload.wave === "number" ? `:w${String(input.payload.wave)}` : "";
    const tag = `${input.eventType}:${String(input.payload.orderId ?? input.payload.messageId ?? Date.now())}${wave}`;

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

  private async userIsRunner(userId: string): Promise<boolean> {
    const row = await this.db
      .select({ userId: runners.userId })
      .from(runners)
      .where(eq(runners.userId, userId))
      .limit(1);
    return Boolean(row[0]);
  }
}
