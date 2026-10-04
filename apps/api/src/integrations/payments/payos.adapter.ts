import { createHmac } from "node:crypto";
import type { PaymentAdapter, PaymentIntent, PaymentWebhookParsed } from "@picki/shared";
import type { PickiConfig } from "../../shared/config.js";

type PayosCreateResponse = {
  code: string;
  desc: string;
  data?: {
    bin?: string;
    accountNumber?: string;
    accountName?: string;
    amount?: number;
    description?: string;
    orderCode?: number;
    currency?: string;
    paymentLinkId?: string;
    status?: string;
    checkoutUrl?: string;
    qrCode?: string;
  };
};

type PayosWebhookBody = {
  code: string;
  desc: string;
  success: boolean;
  data: Record<string, string | number | boolean | null>;
  signature: string;
};

function payosOrderCode(paymentId: string): number {
  const hex = paymentId.replace(/-/g, "").slice(0, 8);
  return Number.parseInt(hex, 16) >>> 0;
}

function signPayosData(data: Record<string, unknown>, checksumKey: string): string {
  const sorted = Object.keys(data)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = data[key];
      return acc;
    }, {});

  const query = Object.entries(sorted)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("&");

  return createHmac("sha256", checksumKey).update(query).digest("hex");
}

export function createPayosAdapter(config: PickiConfig): PaymentAdapter {
  const clientId = config.payosClientId!;
  const apiKey = config.payosApiKey!;
  const checksumKey = config.payosChecksumKey!;
  const webOrigin = config.webOrigin;

  return {
    providerKey: "PAYOS",

    async createIntent(intent: PaymentIntent) {
      const coded = intent.metadata?.payosOrderCode;
      const orderCode = typeof coded === "number" ? coded : payosOrderCode(intent.pickiPaymentId);
      const description =
        typeof intent.metadata?.orderNumber === "string"
          ? `Picki ${intent.metadata.orderNumber}`
          : typeof intent.metadata?.description === "string"
            ? intent.metadata.description
            : `Picki ${intent.pickiPaymentId.slice(0, 8)}`;
      const returnPath =
        typeof intent.metadata?.returnPath === "string"
          ? intent.metadata.returnPath
          : `/orders/${String(intent.metadata?.orderId ?? "")}`;

      const body = {
        orderCode,
        amount: intent.amountVnd,
        description: description.slice(0, 25),
        cancelUrl: `${webOrigin}${returnPath}${returnPath.includes("?") ? "&" : "?"}pay=cancelled`,
        returnUrl: `${webOrigin}${returnPath}${returnPath.includes("?") ? "&" : "?"}pay=return`,
      };

      const res = await fetch("https://api-merchant.payos.vn/v2/payment-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-client-id": clientId,
          "x-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as PayosCreateResponse;
      if (!res.ok || json.code !== "00" || !json.data) {
        throw new Error(json.desc || "PayOS create payment failed");
      }

      const ref = json.data.paymentLinkId ?? String(json.data.orderCode ?? orderCode);

      return {
        adapterReference: ref,
        checkoutUrl: json.data.checkoutUrl,
        qrCode: json.data.qrCode,
      };
    },

    async parseWebhook(_headers: Record<string, string>, body: unknown): Promise<PaymentWebhookParsed> {
      const payload = body as PayosWebhookBody;
      if (!payload?.data || !payload.signature) {
        throw new Error("Invalid PayOS webhook payload");
      }

      const expected = signPayosData(payload.data, checksumKey);
      if (expected !== payload.signature) {
        throw new Error("Invalid PayOS webhook signature");
      }

      const orderCode = String(payload.data.orderCode ?? "");
      const providerEventId = `payos:${orderCode}:${String(payload.data.reference ?? payload.desc)}`;

      let status: PaymentWebhookParsed["status"] = "FAILED";
      if (payload.success && payload.code === "00") {
        status = "SUCCEEDED";
      } else if (payload.code === "01") {
        status = "CANCELLED";
      }

      return {
        providerEventId,
        pickiPaymentId: undefined,
        raw: payload,
        status,
        providerRef: String(payload.data.paymentLinkId ?? orderCode),
      };
    },

    async refund() {
      throw new Error("PayOS refund not implemented in pilot");
    },
  };
}

/** Resolve PayOS payment id from stored provider_ref or orderCode in webhook */
export function payosOrderCodeFromPaymentId(paymentId: string): number {
  return payosOrderCode(paymentId);
}
