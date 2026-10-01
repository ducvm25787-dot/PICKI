import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  familyDinnerProviderSettings,
  getLocationHeader,
  listDailySpecialsForLocation,
  listLocationMenu,
  listOptionGroupsForOfferings,
  providerCapabilities,
  providerLocations,
  providers,
  resolveTodayOffer,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { loadProviderContactPhone, loadProviderBrand } from "../orders/order-enrichment.js";
import { defaultDinnerServiceDate } from "../family-dinner/family-dinner.service.js";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";

@Injectable()
export class CatalogService {
  constructor(
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
    @Inject(PICKI_DB) private readonly db: PickiDb,
  ) {}

  async getLocationMenu(locationId: string) {
    const header = await getLocationHeader(this.sql, locationId);
    if (!header) {
      throw new PickiError("NOT_FOUND", "Provider location not found");
    }

    const [items, specials, dinnerSettings] = await Promise.all([
      listLocationMenu(this.sql, locationId),
      listDailySpecialsForLocation(this.sql, locationId),
      this.db
        .select({ enabled: familyDinnerProviderSettings.enabled })
        .from(familyDinnerProviderSettings)
        .where(eq(familyDinnerProviderSettings.providerLocationId, locationId))
        .limit(1),
    ]);

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
}
