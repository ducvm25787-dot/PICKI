import webpush from "web-push";
import type { PickiConfig } from "../../shared/config.js";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export function configureWebPush(config: PickiConfig): boolean {
  if (!config.vapidPublicKey || !config.vapidPrivateKey || !config.vapidSubject) {
    return false;
  }
  webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  return true;
}

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload),
  );
}
