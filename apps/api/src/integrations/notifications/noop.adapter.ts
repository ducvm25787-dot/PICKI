import type { NotificationAdapter } from "@picki/shared";

export const noopNotificationAdapter: NotificationAdapter = {
  channel: "ZALO",
  async send() {
    /* Sprint 17 wires OA. Core must still publish outbox events. */
  },
};
