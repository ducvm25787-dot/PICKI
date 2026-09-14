import type { PaymentAdapter } from "@picki/shared";

export const noopPaymentAdapter: PaymentAdapter = {
  providerKey: "noop",
  async createIntent(intent) {
    return { adapterReference: `noop:${intent.pickiPaymentId}` };
  },
  async parseWebhook() {
    throw new Error("noop adapter has no webhooks");
  },
  async refund() {
    throw new Error("noop adapter cannot refund");
  },
};
