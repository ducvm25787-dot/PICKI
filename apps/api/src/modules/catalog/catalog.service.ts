import { Inject, Injectable } from "@nestjs/common";
import {
  getLocationHeader,
  listDailySpecialsForLocation,
  listLocationMenu,
  type PickiSql,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_SQL } from "../../shared/tokens.js";

@Injectable()
export class CatalogService {
  constructor(@Inject(PICKI_SQL) private readonly sql: PickiSql) {}

  async getLocationMenu(locationId: string) {
    const header = await getLocationHeader(this.sql, locationId);
    if (!header) {
      throw new PickiError("NOT_FOUND", "Provider location not found");
    }

    const [items, specials] = await Promise.all([
      listLocationMenu(this.sql, locationId),
      listDailySpecialsForLocation(this.sql, locationId),
    ]);

    return {
      location: {
        id: header.location_id,
        providerId: header.provider_id,
        brandName: header.brand_name,
        displayName: header.display_name,
        liveStatus: header.live_status,
        tagline: header.tagline,
        prepMinutes: header.prep_minutes,
        etaMinutes: header.eta_minutes,
        liveMessage: header.live_message,
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
        paymentPolicy: i.payment_policy,
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
