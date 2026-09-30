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
  const body = JSON.stringify(payload);
  const subscriptionBody = {
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  };
  await Promise.race([
    webpush.sendNotification(subscriptionBody, body, { timeout: 8000, TTL: 60 }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Web push timed out")), 9000);
    }),
  ]);
}
