import { applyDeliveryPromotion, type DeliveryPromotionRule } from "./delivery-promotion.js";
import type { DeliveryFundingSnapshot } from "./delivery-snapshot.js";

export const TRIP_CLASSES = [
  "SAME_BUILDING",
  "BUILDING_TO_BUILDING",
  "GROUND_TO_BUILDING",
  "BUILDING_TO_GROUND",
  "GROUND_TO_GROUND",
] as const;

export type TripClass = (typeof TRIP_CLASSES)[number];
export type HandlingFlag = "HOT_FOOD" | "HEAVY" | "BULKY";

export const PRICING_VERSION = "p4.5";

export type ZoneTripPricing = {
  zoneId: string;
  sameBuildingBaseFee: number;
  buildingToBuildingBaseFee: number;
  groundToBuildingBaseFee: number;
  buildingToGroundBaseFee: number;
  groundToGroundBaseFee: number;
  minimumRunnerPayable: number;
  hotFoodSurcharge: number;
  heavySurcharge: number;
  bulkySurcharge: number;
  batchExtraOrderFee: number;
};

export type PlaceTripPricing = {
  id: string;
  zoneId: string;
  kind: string;
  code: string;
  anchorCode: string | null;
  doorSurcharge: number;
  slowElevatorSurcharge: number;
  lobbyWaitMinutes: number;
  elevatorWaitMinutes: number;
  doorWaitMinutes: number;
  runnerFeePerMinuteVnd: number;
};

export type DeliveryQuote = {
  tripClass: TripClass;
  tripBase: number;
  buildingSurcharge: number;
  doorSurcharge: number;
  handlingSurcharge: number;
  batchAdjustment: number;
  runnerPayable: number;
  pricingRuleSnapshot: {
    version: typeof PRICING_VERSION;
    zoneId: string;
    tripClass: TripClass;
    tripBase: number;
    buildingSurcharge: number;
    doorSurcharge: number;
    slowElevatorSurcharge: number;
    handlingSurcharge: number;
    handlingFlags: HandlingFlag[];
    buildingKey: string;
    minimumApplied: number;
    batchAdjustment: number;
    runnerPayable: number;
  };
};

export type BatchOrderPricing = {
  orderId: string;
  tripBase: number;
  buildingKey: string;
  buildingSurcharge: number;
  handlingSurcharge: number;
  runnerPayable: number;
};

const BUILDING_KINDS = new Set(["BUILDING", "RESIDENTIAL_PODIUM_CLUSTER"]);
const GROUND_KINDS = new Set(["TRADITIONAL_MARKET", "GROUND_STREET_CLUSTER", "AREA"]);

function side(place: PlaceTripPricing | null): "BUILDING" | "GROUND" | null {
  if (!place) return null;
  if (BUILDING_KINDS.has(place.kind)) return "BUILDING";
  if (GROUND_KINDS.has(place.kind)) return "GROUND";
  return null;
}

function buildingKey(place: PlaceTripPricing): string {
  return (place.anchorCode?.trim() || place.code).toUpperCase();
}

export function classifyTrip(input: {
  origin: PlaceTripPricing | null;
  destination: PlaceTripPricing | null;
  destinationIsGround?: boolean;
}): TripClass | null {
  const originSide = side(input.origin);
  const destinationSide = input.destination ? side(input.destination) : input.destinationIsGround ? "GROUND" : null;
  if (!originSide || !destinationSide || !input.origin) return null;
  if (originSide === "BUILDING" && destinationSide === "BUILDING" && input.destination) {
    return buildingKey(input.origin) === buildingKey(input.destination) ? "SAME_BUILDING" : "BUILDING_TO_BUILDING";
  }
  if (originSide === "GROUND" && destinationSide === "BUILDING") return "GROUND_TO_BUILDING";
  if (originSide === "BUILDING" && destinationSide === "GROUND") return "BUILDING_TO_GROUND";
  if (originSide === "GROUND" && destinationSide === "GROUND") return "GROUND_TO_GROUND";
  return null;
}

function tripBase(zone: ZoneTripPricing, tripClass: TripClass): number {
  if (tripClass === "SAME_BUILDING") return zone.sameBuildingBaseFee;
  if (tripClass === "BUILDING_TO_BUILDING") return zone.buildingToBuildingBaseFee;
  if (tripClass === "GROUND_TO_BUILDING") return zone.groundToBuildingBaseFee;
  if (tripClass === "BUILDING_TO_GROUND") return zone.buildingToGroundBaseFee;
  return zone.groundToGroundBaseFee;
}

function accessPlace(origin: PlaceTripPricing, destination: PlaceTripPricing | null): PlaceTripPricing {
  if (destination && side(destination) === "BUILDING") return destination;
  return origin;
}

export function quoteDelivery(input: {
  zone: ZoneTripPricing;
  origin: PlaceTripPricing | null;
  destination: PlaceTripPricing | null;
  destinationIsGround?: boolean;
  handlingFlags?: readonly HandlingFlag[];
}): DeliveryQuote | null {
  if (!input.origin || input.origin.zoneId !== input.zone.zoneId) return null;
  if (input.destination && input.destination.zoneId !== input.zone.zoneId) return null;
  const tripClass = classifyTrip(input);
  if (!tripClass) return null;
  const place = accessPlace(input.origin, input.destination);
  const doorSurcharge = place.doorSurcharge;
  const slowElevatorSurcharge = place.slowElevatorSurcharge;
  const waitMinutes = place.lobbyWaitMinutes + place.elevatorWaitMinutes + place.doorWaitMinutes;
  const buildingSurcharge = doorSurcharge + slowElevatorSurcharge + waitMinutes * place.runnerFeePerMinuteVnd;
  const flags = [...new Set(input.handlingFlags ?? [])];
  const handlingSurcharge = flags.reduce((sum, flag) => {
    if (flag === "HOT_FOOD") return sum + input.zone.hotFoodSurcharge;
    if (flag === "HEAVY") return sum + input.zone.heavySurcharge;
    return sum + input.zone.bulkySurcharge;
  }, 0);
  const raw = tripBase(input.zone, tripClass) + buildingSurcharge + handlingSurcharge;
  const minimumApplied = Math.max(0, input.zone.minimumRunnerPayable - raw);
  const runnerPayable = raw + minimumApplied;
  return {
    tripClass,
    tripBase: tripBase(input.zone, tripClass),
    buildingSurcharge,
    doorSurcharge,
    handlingSurcharge,
    batchAdjustment: 0,
    runnerPayable,
    pricingRuleSnapshot: {
      version: PRICING_VERSION,
      zoneId: input.zone.zoneId,
      tripClass,
      tripBase: tripBase(input.zone, tripClass),
      buildingSurcharge,
      doorSurcharge,
      slowElevatorSurcharge,
      handlingSurcharge,
      handlingFlags: flags,
      buildingKey: buildingKey(place),
      minimumApplied,
      batchAdjustment: 0,
      runnerPayable,
    },
  };
}

/** Existing promotion split. The base is the quoted runner payable, not a second subsidy system. */
export function fundDeliveryQuote(
  quote: DeliveryQuote,
  input: { subtotalVnd: number; promotion: DeliveryPromotionRule | null },
): DeliveryFundingSnapshot {
  return applyDeliveryPromotion({
    baseVnd: quote.runnerPayable,
    subtotalVnd: input.subtotalVnd,
    fulfillmentMode: "PICKEE_RUNNER",
    promotion: input.promotion,
  });
}

export function priceBatchRoute(input: {
  orders: readonly BatchOrderPricing[];
  extraOrderFee: number;
}): { routeRunnerPayable: number; allocations: { orderId: string; amount: number }[] } {
  if (input.orders.length === 0) return { routeRunnerPayable: 0, allocations: [] };
  const tripBase = Math.max(...input.orders.map((order) => order.tripBase));
  const buildings = new Map<string, number>();
  for (const order of input.orders) {
    buildings.set(order.buildingKey, Math.max(buildings.get(order.buildingKey) ?? 0, order.buildingSurcharge));
  }
  const building = [...buildings.values()].reduce((sum, value) => sum + value, 0);
  const handling = input.orders.reduce((sum, order) => sum + order.handlingSurcharge, 0);
  const extra = Math.max(0, input.orders.length - 1) * input.extraOrderFee;
  const routeRunnerPayable = tripBase + building + handling + extra;
  const weight = input.orders.reduce((sum, order) => sum + order.runnerPayable, 0);
  let used = 0;
  const allocations = input.orders.map((order, index) => {
    if (index === input.orders.length - 1) return { orderId: order.orderId, amount: routeRunnerPayable - used };
    const amount = weight === 0 ? Math.floor(routeRunnerPayable / input.orders.length) : Math.floor((routeRunnerPayable * order.runnerPayable) / weight);
    used += amount;
    return { orderId: order.orderId, amount };
  });
  return { routeRunnerPayable, allocations };
}
