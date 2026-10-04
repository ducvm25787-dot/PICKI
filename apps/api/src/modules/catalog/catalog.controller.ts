import { Controller, Get, Inject, Param, Req } from "@nestjs/common";
import type { Request } from "express";
import { sessionTokenForRequest } from "../auth/session-auth.guard.js";
import { SessionService } from "../auth/session.service.js";
import { CatalogService } from "./catalog.service.js";

@Controller("locations")
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalogService: CatalogService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Get(":locationId/morning")
  morning(@Param("locationId") locationId: string) {
    return this.catalogService.getMorningShelf(locationId);
  }

  @Get(":locationId/menu")
  async menu(@Param("locationId") locationId: string, @Req() req: Request) {
    const token = sessionTokenForRequest(req);
    const userId = token ? await this.sessions.resolveUserId(token) : null;
    return this.catalogService.getLocationMenu(locationId, userId);
  }
}
