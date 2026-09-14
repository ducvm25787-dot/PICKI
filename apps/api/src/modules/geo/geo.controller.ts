import { Body, Controller, Get, HttpCode, Inject, Post } from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { GeoService } from "./geo.service.js";
import {
  containsSchema,
  distanceSchema,
  etaSchema,
  geocodeSchema,
  reverseGeocodeSchema,
} from "./dto.js";

@Controller("geo")
export class GeoController {
  constructor(@Inject(GeoService) private readonly geoService: GeoService) {}

  @Get("status")
  async status() {
    return this.geoService.status();
  }

  @Post("distance")
  @HttpCode(200)
  async distance(@Body() body: unknown) {
    const parsed = distanceSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid distance request", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.geoService.distance(parsed.data.from, parsed.data.to);
  }

  @Post("contains")
  @HttpCode(200)
  async contains(@Body() body: unknown) {
    const parsed = containsSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid contains request", {
        details: { issues: parsed.error.issues },
      });
    }
    const contained = await this.geoService.contains(
      parsed.data.geometryWkt,
      parsed.data.point,
    );
    return { contained };
  }

  @Post("geocode")
  @HttpCode(200)
  async geocode(@Body() body: unknown) {
    const parsed = geocodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid geocode request", {
        details: { issues: parsed.error.issues },
      });
    }
    const point = await this.geoService.geocode(parsed.data.query);
    return { point };
  }

  @Post("reverse")
  @HttpCode(200)
  async reverse(@Body() body: unknown) {
    const parsed = reverseGeocodeSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid reverse geocode request", {
        details: { issues: parsed.error.issues },
      });
    }
    const address = await this.geoService.reverseGeocode(parsed.data);
    return { address };
  }

  @Post("eta")
  @HttpCode(200)
  async eta(@Body() body: unknown) {
    const parsed = etaSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid ETA request", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.geoService.eta(parsed.data.from, parsed.data.to);
  }
}
