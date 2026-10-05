export type PickiId = string & { readonly __brand: "PickiId" };

export function asPickiId(value: string): PickiId {
  return value as PickiId;
}

/** Integer Vietnamese đồng. Never use floating-point for money. */
export type Vnd = number & { readonly __brand: "Vnd" };

export function vnd(amount: number): Vnd {
  if (!Number.isInteger(amount)) {
    throw new Error("VND amounts must be integers");
  }
  return amount as Vnd;
}

export const identityProviders = ["PHONE", "EMAIL", "ZALO", "APPLE", "GOOGLE"] as const;
export type IdentityProviderKind = (typeof identityProviders)[number];

export const userRoles = [
  "CUSTOMER",
  "PROVIDER_OWNER",
  "PROVIDER_MANAGER",
  "PROVIDER_STAFF",
  "RUNNER",
  "ZONE_AGENT",
  "ZONE_OPERATOR",
  "SUPPORT",
  "FINANCE",
  "ZONE_ADMIN",
  "CITY_ADMIN",
  "SUPER_ADMIN",
] as const;
export type UserRole = (typeof userRoles)[number];

export const membershipStatuses = ["JOINED", "VERIFIED", "SUSPENDED", "LEFT"] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export const addressTypes = [
  "RESIDENTIAL",
  "WORKPLACE",
  "STREET_ADDRESS",
  "TEMPORARY",
  "OTHER",
] as const;
export type AddressType = (typeof addressTypes)[number];

export const addressVerificationStatuses = [
  "UNVALIDATED",
  "LEVEL_1_VALIDATED",
  "VERIFIED",
  "REVOKED",
] as const;
export type AddressVerificationStatus = (typeof addressVerificationStatuses)[number];

export const zoneCandidateStatuses = [
  "DETECTED",
  "CANDIDATE",
  "UNDER_REVIEW",
  "FIELD_VALIDATION",
  "APPROVED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type ZoneCandidateStatus = (typeof zoneCandidateStatuses)[number];

export const zoneProductionStatuses = [
  "DRAFT",
  "CONFIGURING",
  "PILOT",
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
  "CLOSED",
] as const;
export type ZoneProductionStatus = (typeof zoneProductionStatuses)[number];

export const serviceAreaKinds = ["CORE", "PRIMARY", "EXTENDED"] as const;
export type ServiceAreaKind = (typeof serviceAreaKinds)[number];

export const serviceabilityResults = ["ELIGIBLE", "NOT_ELIGIBLE"] as const;
export type ServiceabilityResult = (typeof serviceabilityResults)[number];

export const providerTypes = [
  "RESTAURANT",
  "FOOD_STALL",
  "HOME_COOK",
  "SUPERMARKET",
  "MINIMART",
  "MARKET_VENDOR",
  "SPECIALTY_STORE",
  "CONVENIENCE_STORE",
  "RETAIL_STORE",
  "LAUNDRY",
  "HOME_SERVICE",
  "BEAUTY",
  "CLEANER",
  "TECHNICIAN",
  "SALON",
  "SPA",
  "NAIL",
  "TUTOR",
  "EDUCATION_PROVIDER",
  "PET_SERVICE",
  "AUTO_SERVICE",
  "SPORTS_FACILITY",
  "HEALTH_PROVIDER",
  "PHARMACY",
  "TRANSPORT_PROVIDER",
  "INDIVIDUAL",
  "COMPANY",
] as const;
export type ProviderType = (typeof providerTypes)[number];

export const providerStatuses = [
  "DRAFT",
  "PENDING_VERIFICATION",
  "VERIFIED",
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
  "CLOSED",
] as const;
export type ProviderStatus = (typeof providerStatuses)[number];

export const providerEngagementModes = [
  "LISTING",
  "LIVE_STATUS",
  "CONTACT",
  "QUEUE_STATUS",
  "BOOKING",
  "LEAD",
  "COMMERCE",
  "PREORDER",
  "DELIVERY",
  "PICKUP_AND_RETURN",
  "CLASSIFIED",
  "PICKI_POINT",
] as const;
export type ProviderEngagementMode = (typeof providerEngagementModes)[number];

export const liveAvailabilityStates = [
  "AVAILABLE_NOW",
  "SHORT_WAIT",
  "BUSY",
  "NOT_ACCEPTING",
  "CLOSED",
] as const;
export type LiveAvailabilityState = (typeof liveAvailabilityStates)[number];

export const offeringTypes = [
  "PRODUCT",
  "SERVICE",
  "BOOKING",
  "REQUEST",
  "LEAD",
] as const;
export type OfferingType = (typeof offeringTypes)[number];

export const pricingKinds = [
  "FIXED",
  "FROM",
  "RANGE",
  "QUOTE_REQUIRED",
  "FREE",
  "CONTACT",
] as const;
export type PricingKind = (typeof pricingKinds)[number];

export const fulfillmentTypes = [
  "DELIVERY",
  "PICKUP",
  "CUSTOMER_VISIT",
  "PROVIDER_VISIT",
  "ON_SITE",
  "REMOTE",
  "NONE",
] as const;
export type FulfillmentType = (typeof fulfillmentTypes)[number];

export const paymentModes = [
  "PAY_ON_PICKI",
  "PAY_PROVIDER_DIRECTLY",
  "PAY_ON_COMPLETION",
  "COD",
  "NO_PAYMENT",
] as const;
export type PaymentMode = (typeof paymentModes)[number];

export const notificationChannels = ["WEB", "ZALO", "PUSH", "SMS", "EMAIL"] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const runnerDispatchPolicies = [
  "PICKI_ONLY",
  "SHOP_RUNNER_FIRST",
  "PICKI_FIRST",
  "MANUAL",
] as const;
export type RunnerDispatchPolicy = (typeof runnerDispatchPolicies)[number];

export const foodOrderStatuses = [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "PROVIDER_ACCEPTED",
  "PREPARING",
  "READY",
  "RUNNER_ASSIGNED",
  "PICKED_UP",
  "DELIVERING",
  "DELIVERED",
  "PROVIDER_REJECTED",
  "CUSTOMER_CANCELLED",
  "SYSTEM_CANCELLED",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;
export type FoodOrderStatus = (typeof foodOrderStatuses)[number];
