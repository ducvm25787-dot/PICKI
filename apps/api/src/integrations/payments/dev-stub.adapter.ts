import type { PaymentAdapter } from "@picki/shared";

/** Local dev payment — confirm via POST /payments/:id/dev-confirm */
export const devStubPaymentAdapter: PaymentAdapter = {
  providerKey: "DEV_STUB",
  async createIntent(intent) {
    return { adapterReference: `dev:${intent.pickiPaymentId}` };
  },
  async parseWebhook() {
    throw new Error("DEV_STUB has no webhooks");
  },
  async refund() {
    throw new Error("DEV_STUB cannot refund");
  },
};
