import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  addressVerifications,
  addresses,
  discoverZonesAtPoint,
  type PickiDb,
  type PickiSql,
  userAddresses,
  userZoneMemberships,
  users,
  zones,
} from "@picki/db";
import { PickiError } from "@picki/shared";
import { PICKI_DB, PICKI_SQL } from "../../shared/tokens.js";
import type { z } from "zod";
import type { joinZoneSchema } from "../zones/dto.js";

type JoinInput = z.infer<typeof joinZoneSchema>;

@Injectable()
export class AddressesService {
  constructor(
    @Inject(PICKI_DB) private readonly db: PickiDb,
    @Inject(PICKI_SQL) private readonly sql: PickiSql,
  ) {}

  async joinZone(
    userId: string,
    zoneId: string,
    input: JoinInput,
    gps: { lat: number; lng: number },
  ) {
    const zone = await this.db.select().from(zones).where(eq(zones.id, zoneId)).limit(1);
    if (!zone[0]) {
      throw new PickiError("NOT_FOUND", "Zone not found");
    }
    if (!["PILOT", "ACTIVE"].includes(zone[0].status)) {
      throw new PickiError("FORBIDDEN", "Zone is not open for joining");
    }

    const inside = await discoverZonesAtPoint(this.sql, gps);
    if (!inside.some((z) => z.zone_id === zoneId)) {
      throw new PickiError("FORBIDDEN", "GPS must be inside Zone to join");
    }

    return this.db.transaction(async (tx) => {
      const [address] = await tx
        .insert(addresses)
        .values({
          zoneId,
          addressType: input.addressType,
          building: input.building ?? null,
          floor: input.floor ?? null,
          apartment: input.apartment ?? null,
          houseNumber: input.houseNumber ?? null,
          alley: input.alley ?? null,
          street: input.street ?? null,
          ward: input.ward ?? null,
          city: input.city ?? "Hà Nội",
          deliveryNote: input.deliveryNote ?? null,
        })
        .returning();

      if (!address) {
        throw new PickiError("INTERNAL_ERROR", "Failed to create address");
      }

      await tx.insert(addressVerifications).values({
        addressId: address.id,
        status: "LEVEL_1_VALIDATED",
        verifiedAt: new Date(),
      });

      await tx.insert(userAddresses).values({
        userId,
        addressId: address.id,
        zoneId,
        label: input.label,
      });

      const existing = await tx
        .select()
        .from(userZoneMemberships)
        .where(
          and(eq(userZoneMemberships.userId, userId), eq(userZoneMemberships.zoneId, zoneId)),
        )
        .limit(1);

      if (existing[0]?.status === "LEFT") {
        await tx
          .update(userZoneMemberships)
          .set({
            status: "JOINED",
            defaultAddressId: address.id,
            joinedAt: new Date(),
            leftAt: null,
            updatedAt: new Date(),
          })
          .where(eq(userZoneMemberships.id, existing[0].id));
      } else if (!existing[0]) {
        await tx.insert(userZoneMemberships).values({
          userId,
          zoneId,
          status: "JOINED",
          defaultAddressId: address.id,
        });
      } else {
        await tx
          .update(userZoneMemberships)
          .set({ defaultAddressId: address.id, updatedAt: new Date() })
          .where(eq(userZoneMemberships.id, existing[0].id));
      }

      await tx
        .update(users)
        .set({ activeZoneId: zoneId, updatedAt: new Date() })
        .where(eq(users.id, userId));

      return {
        zoneId,
        addressId: address.id,
        membershipStatus: "JOINED" as const,
      };
    });
  }

  async listMemberships(userId: string) {
    const rows = await this.db
      .select({
        membership: userZoneMemberships,
        zone: zones,
      })
      .from(userZoneMemberships)
      .innerJoin(zones, eq(userZoneMemberships.zoneId, zones.id))
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      );

    return rows.map((r) => ({
      zoneId: r.zone.id,
      slug: r.zone.slug,
      name: r.zone.name,
      displayName: r.zone.displayName,
      defaultAddressId: r.membership.defaultAddressId,
      joinedAt: r.membership.joinedAt,
    }));
  }
}
