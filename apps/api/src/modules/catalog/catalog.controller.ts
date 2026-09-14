import { Controller, Get, Inject, Param } from "@nestjs/common";
import { CatalogService } from "./catalog.service.js";

@Controller("locations")
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get(":locationId/menu")
  async menu(@Param("locationId") locationId: string) {
    return this.catalogService.getLocationMenu(locationId);
  }
}
