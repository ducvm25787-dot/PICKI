import { Controller, Get, Inject, Param } from "@nestjs/common";
import { resolveVerifiedQr, type PickiDb } from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";

@Controller("qr")
export class QrController {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  @Get(":token")
  async resolve(@Param("token") token: string) {
    const locationId = await resolveVerifiedQr(this.db, token);
    if (!locationId) {
      throw new PickiError("NOT_FOUND", "QR không còn hiệu lực");
    }
    return { locationId };
  }
}
