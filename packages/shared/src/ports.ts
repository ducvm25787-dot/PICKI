import type {
  IdentityProviderKind,
  NotificationChannel,
  PickiId,
  ServiceabilityResult,
  Vnd,
} from "./domain.js";

export type ExternalProfile = {
  provider: IdentityProviderKind;
  externalUserId: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
};

export interface IdentityAdapter {
  readonly kind: IdentityProviderKind;
  verifyExternalSession(proof: unknown): Promise<ExternalProfile>;
}

export type NotificationMessage = {
  channel: NotificationChannel;
  toUserId: PickiId;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

export interface NotificationAdapter {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<void>;
}

export type PaymentIntent = {
  pickiPaymentId: PickiId;
  amountVnd: Vnd;
  metadata?: Record<string, unknown>;
};

export type PaymentWebhookResult = {
  providerEventId: string;
  pickiPaymentId?: PickiId;
  raw: unknown;
};

export interface PaymentAdapter {
  readonly providerKey: string;
  createIntent(intent: PaymentIntent): Promise<{ adapterReference: string }>;
  parseWebhook(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<PaymentWebhookResult>;
  refund(pickiPaymentId: PickiId, amountVnd: Vnd): Promise<void>;
}

export type GeoPoint = { lng: number; lat: number };

export interface GeoAdapter {
  readonly providerKey: string;
  geocode(query: string): Promise<GeoPoint | null>;
  reverseGeocode(point: GeoPoint): Promise<string | null>;
  /** Road-network ETA when vendor available; null if unknown. */
  routeEtaSeconds(from: GeoPoint, to: GeoPoint): Promise<number | null>;
  navigationLink?(from: GeoPoint, to: GeoPoint): Promise<string | null>;
}

export type ServiceabilityInput = {
  providerLocationId: PickiId;
  customerAddressId: PickiId;
  serviceType: string;
};

export interface ServiceabilityPort {
  evaluate(input: ServiceabilityInput): Promise<ServiceabilityResult>;
}
