import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { MARKET_MORNING_PURPOSE, morningOrderingOpen, tomorrowDate } from "@picki/shared";
import {
  familyDinnerProviderSettings,
  getLocationHeader,
  listDailySpecialsForLocation,
  listLocationMenu,
  listOptionGroupsForOfferings,
  ensureScheduledWindows,
  providerCapabilities,
  scheduledDeliveryWindows,
  scheduledFulfillmentSettings,
  providerLocations,
  providers,
  resolveTodayOffer,
  resolveScheduledOffer,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { viewerCanSeeDraftBeer } from "../draft-beer/access.js";
import { loadProviderContactPhone, loadProviderBrand } from "../orders/order-enrichment.js";
import { defaultDinnerServiceDate } from "../family-dinner/family-dinner.service.js";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(PICKI_DB) private readonly db: PickiDb,
  ) {}

  async getLocationMenu(locationId: string, userId?: string | null) {
    const header = await getLocationHeader(this.sql, locationId);
    if (!header) {
      throw new PickiError("NOT_FOUND", "Provider location not found");
    }

    const [menuRows, specials, dinnerSettings, seeDraftBeer] = await Promise.all([
      listLocationMenu(this.sql, locationId),
      listDailySpecialsForLocation(this.sql, locationId),
      this.db
        .select({ enabled: familyDinnerProviderSettings.enabled })
        .from(familyDinnerProviderSettings)
        .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
        .limit(1),
      viewerCanSeeDraftBeer(this.db, userId),
    ]);
    const items = seeDraftBeer ? menuRows : menuRows.filter((row) => !row.alcohol_restricted);

    const familyDinnerEnabled = dinnerSettings[0]?.enabled === true;
    const visibleIds = items
      .filter((row) => {
        const today = resolveTodayOffer({
          basePriceVnd: row.amount_vnd,
          dayStatus: row.day_status,
          availableQty: row.available_qty,
          reservedQty: row.reserved_qty,
          soldQty: row.sold_qty,
          priceOverrideVnd: row.price_override_vnd,
        });
        return today.visible;
      })
      .map((row) => row.offering_id);
    const optionGroups = await listOptionGroupsForOfferings(this.db, visibleIds);

    const [providerPhone, brandName, commerce] = await Promise.all([
      loadProviderContactPhone(this.db, locationId),
      loadProviderBrand(this.db, locationId),
      this.db
        .select({
          model: providers.commerceModel,
          sellNow: providerCapabilities.enabled,
        })
        .from(providerLocations)
        .innerJoin(providers, eq(providers.id, providerLocations.providerId))
        .leftJoin(
          providerCapabilities,
          and(
            eq(providerCapabilities.providerId, providers.id),
            eq(providerCapabilities.capability, "SELL_NOW"),
          ),
        )
        .where(eq(providerLocations.id, locationId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    const sellNow =
      commerce?.model === "FOOD_SERVICE"
        ? commerce.sellNow !== false
        : (commerce?.model === "FRESH_MARKET" || commerce?.model === "RETAIL_STORE") &&
          commerce.sellNow === true;

    return {
      location: {
        id: header.location_id,
        providerId: header.provider_id,
        providerType: header.provider_type,
        brandName: header.brand_name,
        displayName: header.display_name,
        liveStatus: header.live_status,
        tagline: header.tagline,
        description: header.description,
        logoUrl: header.logo_url,
        coverUrl: header.cover_url,
        prepMinutes: header.prep_minutes,
        etaMinutes: header.eta_minutes,
        estimatedWaitMinutes: header.estimated_wait_minutes,
        liveMessage: header.live_message,
        addressLine: header.address_line,
        lat: header.lat,
        lng: header.lng,
        pickeeVerified: header.verification_status === "VERIFIED",
        sellNow,
        contacts: {
          provider: {
            phone: providerPhone,
            label: brandName ?? header.brand_name,
          },
        },
      },
      familyDinner: familyDinnerEnabled
        ? { enabled: true, serviceDate: defaultDinnerServiceDate() }
        : { enabled: false },
      items: items.flatMap((i) => {
        const today = resolveTodayOffer({
          basePriceVnd: i.amount_vnd,
          dayStatus: i.day_status,
          availableQty: i.available_qty,
          reservedQty: i.reserved_qty,
          soldQty: i.sold_qty,
          priceOverrideVnd: i.price_override_vnd,
        });
        if (!today.visible) return [];
        return [
          {
            id: i.offering_id,
            slug: i.slug,
            name: i.name,
            description: i.description,
            amountVnd: today.amountVnd,
            listAmountVnd: today.listAmountVnd,
            pricingKind: i.pricing_kind,
            foodMoment: i.food_moment,
            fulfillmentMode: i.fulfillment_mode,
            educationSubject: i.education_subject,
            educationGrade: i.education_grade,
            paymentPolicy: i.payment_policy,
            estimatedDays: i.estimated_days,
            imageUrl: i.image_url,
            unit: i.unit,
            prepTimeMinutes: i.prep_time_minutes,
            categoryId: i.category_id,
            categoryName: i.category_name,
            alcoholRestricted: i.alcohol_restricted,
            todayStatus: today.todayStatus,
            todayRemaining: today.remaining,
            optionGroups: optionGroups.get(i.offering_id) ?? [],
          },
        ];
      }),
      dailySpecials: specials.map((s) => ({
        id: s.special_id,
        offeringId: s.offering_id,
        name: s.name,
        description: s.description,
        amountVnd: s.amount_vnd,
        quantityRemaining: s.quantity_remaining,
        fulfillmentMode: s.fulfillment_mode,
      })),
    };
  }

  async getMorningShelf(locationId: string) {
    const header = await getLocationHeader(this.sql, locationId);
    if (!header) throw new PickiError("NOT_FOUND", "Provider location not found");
    const serviceDate = tomorrowDate(new Date());
    const [shop] = await this.db
      .select({ model: providers.commerceModel })
      .from(providerLocations)
      .innerJoin(providers, eq(providers.id, providerLocations.providerId))
      .where(eq(providerLocations.id, locationId))
      .limit(1);
    const market = shop?.model === "FRESH_MARKET" || shop?.model === "RETAIL_STORE";
    if (!market) {
      return { enabled: false, orderingOpen: false, serviceDate, cutoffTime: null, windows: [], items: [] };
    }
    const [settings] = await this.db
      .select()
      .from(scheduledFulfillmentSettings)
      .where(
        and(
          eq(scheduledFulfillmentSettings.providerLocationId, locationId),
          eq(scheduledFulfillmentSettings.purpose, MARKET_MORNING_PURPOSE),
        ),
      )
      .limit(1);
    if (!settings?.enabled) {
      return { enabled: false, orderingOpen: false, serviceDate, cutoffTime: null, windows: [], items: [] };
    }
    const cutoffTime = String(settings.cutoffTime).slice(0, 5);
    await ensureScheduledWindows(this.db, {
      providerLocationId: locationId,
      serviceDate,
      purpose: MARKET_MORNING_PURPOSE,
      slots: settings.slots,
    });
    const windows = await this.db
      .select()
      .from(scheduledDeliveryWindows)
      .where(
        and(
          eq(scheduledDeliveryWindows.providerLocationId, locationId),
          eq(scheduledDeliveryWindows.serviceDate, serviceDate),
          eq(scheduledDeliveryWindows.purpose, MARKET_MORNING_PURPOSE),
          eq(scheduledDeliveryWindows.status, "OPEN"),
        ),
      );
    const rows = await listLocationMenu(this.sql, locationId, serviceDate);
    const items = rows.flatMap((row) => {
      const day = resolveScheduledOffer({
        basePriceVnd: row.amount_vnd,
        dayStatus: row.day_status,
        availableQty: row.available_qty,
        reservedQty: row.reserved_qty,
        soldQty: row.sold_qty,
        priceOverrideVnd: row.price_override_vnd,
      });
      if (!day.ok) return [];
      return [
        {
          id: row.offering_id,
          name: row.name,
          description: row.description,
          amountVnd: day.amountVnd,
          listAmountVnd: day.listAmountVnd,
          pricingKind: row.pricing_kind,
          imageUrl: row.image_url,
          unit: row.unit,
          categoryName: row.category_name,
          todayStatus: "AVAILABLE" as const,
          todayRemaining: day.remaining,
        },
      ];
    });
    return {
      enabled: true,
      orderingOpen: morningOrderingOpen({ now: new Date(), serviceDate, cutoffTime }),
      serviceDate,
      cutoffTime,
      windows: windows
        .map((window) => {
          const startsAt = String(window.startsAt).slice(0, 5);
          const endsAt = String(window.endsAt).slice(0, 5);
          return { id: window.id, startsAt, endsAt, label: `${startsAt}–${endsAt}` };
        })
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
      items,
    };
  }
}
