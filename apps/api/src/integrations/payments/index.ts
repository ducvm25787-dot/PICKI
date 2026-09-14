import type { PaymentAdapter } from "@picki/shared";
import type { PickiConfig } from "../../shared/config.js";
import { devStubPaymentAdapter } from "./dev-stub.adapter.js";
import { createPayosAdapter } from "./payos.adapter.js";

export function createPaymentAdapter(config: PickiConfig): PaymentAdapter {
  if (config.payosClientId && config.payosApiKey && config.payosChecksumKey) {
    return createPayosAdapter(config);
  }
  return devStubPaymentAdapter;
}

export { devStubPaymentAdapter } from "./dev-stub.adapter.js";
export { createPayosAdapter } from "./payos.adapter.js";
