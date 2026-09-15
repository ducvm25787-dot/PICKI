import { Inject, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  notifications,
  providerLocations,
  providerMembers,
  providers,
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
  listingId?: string;
  listingNumber?: string;
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
      providerType?: string;
      status?: string;
      scheduledAt?: string;
      teacherName?: string;
      locationType?: string;
      locationDetail?: string;
      actorUserId?: string | null;
    },
  ): Promise<void> {
    const basePayload = {
      requestId: payload.requestId,
      requestNumber: payload.requestNumber,
    };
    const excludeActor = payload.actorUserId ?? null;
    let providerType = payload.providerType;
    if (!providerType) {
      const row = await this.db
        .select({ providerType: providers.providerType })
        .from(providerLocations)
        .innerJoin(providers, eq(providers.id, providerLocations.providerId))
        .where(eq(providerLocations.id, payload.providerLocationId))
        .limit(1);
      providerType = row[0]?.providerType;
    }
    const isEducation =
      providerType === "EDUCATION_PROVIDER" || providerType === "TUTOR";
    const isSports = providerType === "SPORTS_FACILITY";

    if (eventType === "service_request.created") {
      const staff = await this.providerStaffForLocation(payload.providerLocationId);
      if (staff.length > 0) {
        await this.deliver(
          staff,
          {
            eventType,
            channel: "WEB",
            title: `${payload.requestNumber}: ${
              isEducation
                ? "Đăng ký học thử mới"
                : isSports
                  ? "Yêu cầu đặt sân mới"
                  : "Yêu cầu mới"
            }`,
            body: isEducation
              ? "Có phụ huynh đăng ký học thử — mở tab Yêu cầu."
              : isSports
                ? "Có khách muốn đặt sân — mở tab Yêu cầu để xác nhận khung giờ."
                : "Có yêu cầu dịch vụ — mở tab Yêu cầu để xử lý.",
            payload: basePayload,
          },
          { excludeUserId: excludeActor },
        );
      }
      return;
    }

    if (eventType === "service_request.trial_scheduled") {
      const when = payload.scheduledAt
        ? new Date(payload.scheduledAt).toLocaleString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const place =
        payload.locationType === "ONLINE"
          ? `Online · ${payload.locationDetail ?? ""}`
          : (payload.locationDetail ?? "");
      await this.deliver(
        [payload.customerUserId],
        {
          eventType,
          channel: "WEB",
          title: `${payload.requestNumber}: Lịch học thử đã sắp`,
          body: `Buổi học ${when}${payload.teacherName ? ` · GV ${payload.teacherName}` : ""}${place ? ` · ${place}` : ""}`,
          payload: basePayload,
        },
        { excludeUserId: excludeActor },
      );
      return;
    }

    const customerCopy: Record<string, { title: string; body: string }> = isEducation
      ? {
          "service_request.confirmed": {
            title: `${payload.requestNumber}: Phụ trách lớp đã nhận`,
            body: "Phụ trách lớp đã nhận yêu cầu - liên hệ qua chat nếu cần.",
          },
          "service_request.rejected": {
            title: `${payload.requestNumber}: Trung tâm từ chối`,
            body: "Trung tâm không nhận đăng ký — xem chi tiết.",
          },
          "service_request.completed": {
            title: `${payload.requestNumber}: Hoàn thành buổi học`,
            body: "Buổi học thử đã hoàn thành.",
          },
          "service_request.cancelled": {
            title: `${payload.requestNumber}: Đã hủy`,
            body: "Đăng ký học thử đã được hủy.",
          },
        }
      : isSports
        ? {
            "service_request.confirmed": {
              title: `${payload.requestNumber}: Sân đã xác nhận`,
              body: "Sân đã nhận yêu cầu đặt — liên hệ nếu cần đổi giờ.",
            },
            "service_request.rejected": {
              title: `${payload.requestNumber}: Sân từ chối`,
              body: "Khung giờ không còn trống — thử giờ khác hoặc chat sân.",
            },
            "service_request.completed": {
              title: `${payload.requestNumber}: Hoàn tất ca sân`,
              body: "Ca đặt sân đã hoàn tất.",
            },
            "service_request.cancelled": {
              title: `${payload.requestNumber}: Đã hủy`,
              body: "Yêu cầu đặt sân đã được hủy.",
            },
          }
        : {
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
      customerUserId?: string;
      providerBrandName?: string | null;
      offeringName?: string;
      etaMinutes?: number;
      expectedAt?: string;
      reason?: string;
      actorUserId?: string | null;
    },
  ): Promise<void> {
    const excludeActor = payload.actorUserId ?? null;

    if (eventType === "visit_intent.shop_waiting") {
      if (typeof payload.customerUserId === "string") {
        const shop = payload.providerBrandName?.trim() || "Tiệm";
        await this.deliver(
          [payload.customerUserId],
          {
            eventType,
            channel: "WEB",
            title: "Tiệm đang chờ bạn",
            body: `${shop} đang mở cửa và chờ bạn tới.`,
            payload: {
              intentId: payload.intentId,
              locationId: payload.providerLocationId,
            },
          },
          { excludeUserId: excludeActor },
        );
      }
      return;
    }

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
      return;
    }

    if (eventType === "visit_intent.provider_rejected") {
      if (typeof payload.customerUserId === "string") {
        const shop = payload.providerBrandName?.trim() || "Tiệm";
        const reason =
          typeof payload.reason === "string" && payload.reason.trim()
            ? payload.reason.trim()
            : "Tiệm không thể nhận lúc này.";
        await this.deliver(
          [payload.customerUserId],
          {
            eventType,
            channel: "WEB",
            title: `${shop} từ chối`,
            body: reason,
            payload: {
              intentId: payload.intentId,
              locationId: payload.providerLocationId,
            },
          },
          { excludeUserId: excludeActor },
        );
      }
    }
  }

  /**
   * Nhắc tái khám — chỉ nói tên phòng khám và việc đến hẹn.
   * Không đưa lý do y tế vào thông báo (§86).
   */
  async processHealthFollowup(
    eventType: string,
    payload: {
      reminderId: string;
      customerUserId: string;
      providerLocationId: string;
    },
  ): Promise<void> {
    if (eventType !== "health.followup_due") return;

    const row = await this.db
      .select({ brandName: providers.brandName })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, payload.providerLocationId))
      .limit(1);
    const clinic = row[0]?.brandName ?? "Phòng khám";

    await this.deliver([payload.customerUserId], {
      eventType,
      channel: "WEB",
      title: "Đến hẹn tái khám",
      body: `${clinic} đã hẹn bạn tái khám — gọi hoặc chat nếu cần đổi lịch.`,
      payload: {
        reminderId: payload.reminderId,
        locationId: payload.providerLocationId,
      },
    });
  }

  async processClassified(
    eventType: string,
    payload: {
      listingId: string;
      listingNumber: string;
      zoneId: string;
      sellerUserId: string;
      buyerUserId?: string | null;
      cancelledByUserId?: string | null;
      title: string;
      listingType?: string;
    },
  ): Promise<void> {
    const basePayload = {
      listingId: payload.listingId,
      listingNumber: payload.listingNumber,
    };

    if (eventType === "classified.reserved" && payload.buyerUserId) {
      await this.deliver([payload.sellerUserId], {
        eventType,
        channel: "WEB",
        title: `${payload.listingNumber}: Có người giữ chỗ`,
        body: `「${payload.title}」— mở chat để hẹn giao/lấy.`,
        payload: basePayload,
      });
      return;
    }

    if (
      (eventType === "classified.completed" || eventType === "classified.given") &&
      payload.buyerUserId
    ) {
      const doneLabel = eventType === "classified.given" ? "đã tặng xong" : "giao dịch hoàn tất";
      await this.deliver([payload.buyerUserId], {
        eventType,
        channel: "WEB",
        title: `${payload.listingNumber}: ${doneLabel}`,
        body: `「${payload.title}」— người đăng xác nhận ${doneLabel}.`,
        payload: basePayload,
      });
      return;
    }

    if (eventType === "classified.reservation_cancelled") {
      const notify =
        payload.cancelledByUserId === payload.sellerUserId
          ? payload.buyerUserId
          : payload.sellerUserId;
      if (typeof notify === "string") {
        await this.deliver([notify], {
          eventType,
          channel: "WEB",
          title: `${payload.listingNumber}: Hủy giữ chỗ`,
          body: `「${payload.title}」— giữ chỗ đã được hủy, tin mở lại.`,
          payload: basePayload,
        });
      }
    }
  }

  async processMessageReceived(payload: MessagePayload): Promise<void> {
    const title = payload.orderNumber
      ? `Tin nhắn đơn ${payload.orderNumber}`
      : payload.listingNumber
        ? `Tin nhắn ${payload.listingNumber}`
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
          listingId: payload.listingId,
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
    if (eventType.startsWith("visit_intent.") || eventType.startsWith("health.")) {
      const locationId = payload.locationId ?? payload.providerLocationId;
      if (typeof locationId === "string") return `/locations/${locationId}`;
    }
    if (eventType.startsWith("classified.")) {
      const listingId = payload.listingId;
      if (typeof listingId === "string") return `/classifieds/${listingId}`;
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
