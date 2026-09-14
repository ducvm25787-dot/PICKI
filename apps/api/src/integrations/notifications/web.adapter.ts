import type { NotificationAdapter } from "@picki/shared";

/** In-app / Web notifications. Persistence handled by NotificationService (S28). */
export const webNotificationAdapter: NotificationAdapter = {
  channel: "WEB",
  async send() {
    /* WEB channel writes via outbox → NotificationService → notifications table. */
  },
};
