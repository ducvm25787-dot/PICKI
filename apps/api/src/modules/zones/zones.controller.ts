import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { PickiError } from "@picki/shared";
import { CurrentUserId } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { AddressesService } from "../addresses/addresses.service.js";
import { addressInputSchema } from "../addresses/dto.js";
import { discoverSchema, joinZoneBodySchema } from "./dto.js";
import { ZonesService } from "./zones.service.js";

@Controller("zones")
export class ZonesController {
  constructor(
    @Inject(ZonesService) private readonly zonesService: ZonesService,
    @Inject(AddressesService) private readonly addressesService: AddressesService,
  ) {}

  @Post("discover")
  @HttpCode(200)
  async discover(@Body() body: unknown) {
    const parsed = discoverSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid GPS coordinates", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.zonesService.discover(parsed.data.lat, parsed.data.lng);
  }

  @Get("mine")
  @UseGuards(SessionAuthGuard)
  async mine(@CurrentUserId() userId: string) {
    const memberships = await this.addressesService.listMemberships(userId);
    return { zones: memberships };
  }

  @Get(":slugOrId/preview")
  async preview(@Param("slugOrId") slugOrId: string) {
    return this.zonesService.previewBySlugOrId(slugOrId);
  }

  @Get(":slugOrId/providers")
  async providers(@Param("slugOrId") slugOrId: string) {
    return this.zonesService.listProviders(slugOrId);
  }

  @Get(":zoneId/addresses")
  @UseGuards(SessionAuthGuard)
  async listAddresses(@CurrentUserId() userId: string, @Param("zoneId") zoneId: string) {
    return this.addressesService.listZoneAddresses(userId, zoneId);
  }

  @Post(":zoneId/addresses")
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async addAddress(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = addressInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid address", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.addressesService.addZoneAddress(userId, zoneId, parsed.data);
  }

  @Patch(":zoneId/addresses/:addressId")
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async updateAddress(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Param("addressId") addressId: string,
    @Body() body: unknown,
  ) {
    const parsed = addressInputSchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid address", {
        details: { issues: parsed.error.issues },
      });
    }
    return this.addressesService.updateZoneAddress(userId, zoneId, addressId, parsed.data);
  }

  @Delete(":zoneId/addresses/:addressId")
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async deleteAddress(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Param("addressId") addressId: string,
  ) {
    return this.addressesService.deleteZoneAddress(userId, zoneId, addressId);
  }

  @Post(":zoneId/join")
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async join(
    @CurrentUserId() userId: string,
    @Param("zoneId") zoneId: string,
    @Body() body: unknown,
  ) {
    const parsed = joinZoneBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new PickiError("VALIDATION_ERROR", "Invalid join request", {
        details: { issues: parsed.error.issues },
      });
    }

    const { lat, lng, ...addressInput } = parsed.data;
    return this.addressesService.joinZone(userId, zoneId, addressInput, { lat, lng });
  }
}
