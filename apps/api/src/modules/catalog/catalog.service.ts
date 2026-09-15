import { Inject, Injectable } from "@nestjs/common";
import {
  getLocationHeader,
  listDailySpecialsForLocation,
  listLocationMenu,
  type PickiDb,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { loadProviderContactPhone, loadProviderBrand } from "../orders/order-enrichment.js";
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

    const [items, specials] = await Promise.all([
      listLocationMenu(this.sql, locationId),
      listDailySpecialsForLocation(this.sql, locationId),
    ]);

    const isBeauty = header.provider_type === "BEAUTY";
    const isPet = header.provider_type === "PET_SERVICE";
    const isAuto = header.provider_type === "AUTO_SERVICE";
    const isSports = header.provider_type === "SPORTS_FACILITY";
    const isHealth = header.provider_type === "HEALTH_PROVIDER";
    const isEducation =
      header.provider_type === "EDUCATION_PROVIDER" || header.provider_type === "TUTOR";
    const withContacts = isBeauty || isPet || isAuto || isSports || isEducation || isHealth;
    const [providerPhone, brandName] = withContacts
      ? await Promise.all([
          loadProviderContactPhone(this.db, locationId),
          loadProviderBrand(this.db, locationId),
        ])
      : [null, null];

    return {
      location: {
        id: header.location_id,
        providerId: header.provider_id,
        providerType: header.provider_type,
        brandName: header.brand_name,
        displayName: header.display_name,
        liveStatus: header.live_status,
        tagline: header.tagline,
        prepMinutes: header.prep_minutes,
        etaMinutes: header.eta_minutes,
        estimatedWaitMinutes: header.estimated_wait_minutes,
        liveMessage: header.live_message,
        addressLine: header.address_line,
        lat: header.lat,
        lng: header.lng,
        contacts: withContacts
          ? {
              provider: {
                phone: providerPhone,
                label: brandName ?? header.brand_name,
              },
            }
          : undefined,
      },
      items: items.map((i) => ({
        id: i.offering_id,
        slug: i.slug,
        name: i.name,
        description: i.description,
        amountVnd: i.amount_vnd,
        pricingKind: i.pricing_kind,
        foodMoment: i.food_moment,
        fulfillmentMode: i.fulfillment_mode,
        educationSubject: i.education_subject,
        educationGrade: i.education_grade,
        paymentPolicy: i.payment_policy,
        estimatedDays: i.estimated_days,
      })),
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
