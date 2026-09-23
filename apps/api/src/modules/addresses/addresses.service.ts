import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import {
  addressVerifications,
  addresses,
  discoverZonesAtPoint,
  getAddressLatLng,
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
import type { addressInputSchema } from "./dto.js";

type JoinInput = z.infer<typeof joinZoneSchema>;
type AddressInput = z.infer<typeof addressInputSchema>;

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
    let joinGps = gps;
    if (!inside.some((z) => z.zone_id === zoneId)) {
      // Pilot / local demo: partner often joins off-site or GPS denied.
      // Fall back to Zone anchor (must itself be inside boundary).
      const anchor = {
        lat: Number(zone[0].anchorLat),
        lng: Number(zone[0].anchorLng),
      };
      const anchorInside = await discoverZonesAtPoint(this.sql, anchor);
      if (
        zone[0].status === "PILOT" &&
        process.env.NODE_ENV !== "production" &&
        anchorInside.some((z) => z.zone_id === zoneId)
      ) {
        joinGps = anchor;
      } else {
        throw new PickiError("FORBIDDEN", "GPS must be inside Zone to join");
      }
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
          coordinates: sql`ST_SetSRID(ST_MakePoint(${joinGps.lng}, ${joinGps.lat}), 4326)`,
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

  async listZoneAddresses(userId: string, zoneId: string) {
    await this.assertZoneMember(userId, zoneId);

    const rows = await this.sql<
      {
        id: string;
        label: string;
        address_type: string;
        building: string | null;
        floor: string | null;
        apartment: string | null;
        house_number: string | null;
        alley: string | null;
        street: string | null;
        ward: string | null;
        city: string | null;
        delivery_note: string | null;
        lat: number | null;
        lng: number | null;
      }[]
    >`
      SELECT
        a.id,
        ua.label,
        a.address_type,
        a.building,
        a.floor,
        a.apartment,
        a.house_number,
        a.alley,
        a.street,
        a.ward,
        a.city,
        a.delivery_note,
        CASE WHEN a.coordinates IS NULL THEN NULL ELSE ST_Y(a.coordinates)::float8 END AS lat,
        CASE WHEN a.coordinates IS NULL THEN NULL ELSE ST_X(a.coordinates)::float8 END AS lng
      FROM user_addresses ua
      INNER JOIN addresses a ON a.id = ua.address_id
      WHERE ua.user_id = ${userId}::uuid AND ua.zone_id = ${zoneId}::uuid
      ORDER BY ua.created_at ASC
    `;

    return {
      addresses: rows.map((r) => ({
        id: r.id,
        label: r.label,
        addressType: r.address_type,
        building: r.building,
        floor: r.floor,
        apartment: r.apartment,
        houseNumber: r.house_number,
        alley: r.alley,
        street: r.street,
        ward: r.ward,
        city: r.city,
        deliveryNote: r.delivery_note,
        lat: r.lat,
        lng: r.lng,
        hasPin: r.lat != null && r.lng != null,
      })),
    };
  }

  async updateAddressPin(
    userId: string,
    zoneId: string,
    addressId: string,
    gps: { lat: number; lng: number },
  ) {
    await this.assertZoneMember(userId, zoneId);
    await this.assertUserAddress(userId, zoneId, addressId);

    await this.sql`
      UPDATE addresses SET
        coordinates = ST_SetSRID(ST_MakePoint(${gps.lng}, ${gps.lat}), 4326),
        updated_at = now()
      WHERE id = ${addressId}::uuid
    `;

    return {
      id: addressId,
      lat: gps.lat,
      lng: gps.lng,
      hasPin: true,
    };
  }

  async addZoneAddress(userId: string, zoneId: string, input: AddressInput) {
    await this.assertZoneMember(userId, zoneId);

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

      return {
        id: address.id,
        label: input.label,
        addressType: address.addressType,
        building: address.building,
        floor: address.floor,
        apartment: address.apartment,
        houseNumber: address.houseNumber,
        alley: address.alley,
        street: address.street,
        ward: address.ward,
        city: address.city,
        deliveryNote: address.deliveryNote,
      };
    });
  }

  async updateZoneAddress(
    userId: string,
    zoneId: string,
    addressId: string,
    input: AddressInput,
  ) {
    await this.assertZoneMember(userId, zoneId);
    await this.assertUserAddress(userId, zoneId, addressId);

    return this.db.transaction(async (tx) => {
      const [address] = await tx
        .update(addresses)
        .set({
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
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, addressId))
        .returning();

      if (!address) {
        throw new PickiError("NOT_FOUND", "Address not found");
      }

      const link = await tx
        .select({ label: userAddresses.label })
        .from(userAddresses)
        .where(
          and(
            eq(userAddresses.userId, userId),
            eq(userAddresses.zoneId, zoneId),
            eq(userAddresses.addressId, addressId),
          ),
        )
        .limit(1);

      return {
        id: address.id,
        label: link[0]?.label ?? input.label,
        addressType: address.addressType,
        building: address.building,
        floor: address.floor,
        apartment: address.apartment,
        houseNumber: address.houseNumber,
        alley: address.alley,
        street: address.street,
        ward: address.ward,
        city: address.city,
        deliveryNote: address.deliveryNote,
      };
    });
  }

  async deleteZoneAddress(userId: string, zoneId: string, addressId: string) {
    await this.assertZoneMember(userId, zoneId);
    await this.assertUserAddress(userId, zoneId, addressId);

    const countRow = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(userAddresses)
      .where(and(eq(userAddresses.userId, userId), eq(userAddresses.zoneId, zoneId)));

    if ((countRow[0]?.count ?? 0) <= 1) {
      throw new PickiError("FORBIDDEN", "Cannot delete your only address in this Zone");
    }

    await this.db.transaction(async (tx) => {
      const membership = await tx
        .select()
        .from(userZoneMemberships)
        .where(
          and(
            eq(userZoneMemberships.userId, userId),
            eq(userZoneMemberships.zoneId, zoneId),
            eq(userZoneMemberships.status, "JOINED"),
          ),
        )
        .limit(1);

      if (membership[0]?.defaultAddressId === addressId) {
        const fallback = await tx
          .select({ addressId: userAddresses.addressId })
          .from(userAddresses)
          .where(
            and(
              eq(userAddresses.userId, userId),
              eq(userAddresses.zoneId, zoneId),
              ne(userAddresses.addressId, addressId),
            ),
          )
          .orderBy(asc(userAddresses.createdAt))
          .limit(1);

        await tx
          .update(userZoneMemberships)
          .set({
            defaultAddressId: fallback[0]?.addressId ?? null,
            updatedAt: new Date(),
          })
          .where(eq(userZoneMemberships.id, membership[0].id));
      }

      await tx
        .delete(userAddresses)
        .where(
          and(
            eq(userAddresses.userId, userId),
            eq(userAddresses.zoneId, zoneId),
            eq(userAddresses.addressId, addressId),
          ),
        );

      await tx.delete(addresses).where(eq(addresses.id, addressId));
    });

    return { deleted: true as const };
  }

  async resolveDeliveryAddress(userId: string, zoneId: string, addressId: string) {
    await this.assertZoneMember(userId, zoneId);

    const row = await this.db
      .select({ address: addresses })
      .from(userAddresses)
      .innerJoin(addresses, eq(userAddresses.addressId, addresses.id))
      .where(
        and(
          eq(userAddresses.userId, userId),
          eq(userAddresses.zoneId, zoneId),
          eq(addresses.id, addressId),
        ),
      )
      .limit(1);

    if (!row[0]) {
      throw new PickiError("NOT_FOUND", "Address not found in this Zone");
    }

    return row[0].address;
  }

  async getDeliveryCoords(addressId: string): Promise<{ lat: number; lng: number } | null> {
    return getAddressLatLng(this.sql, addressId);
  }

  private async assertUserAddress(userId: string, zoneId: string, addressId: string) {
    const row = await this.db
      .select({ id: userAddresses.id })
      .from(userAddresses)
      .where(
        and(
          eq(userAddresses.userId, userId),
          eq(userAddresses.zoneId, zoneId),
          eq(userAddresses.addressId, addressId),
        ),
      )
      .limit(1);

    if (!row[0]) {
      throw new PickiError("NOT_FOUND", "Address not found in this Zone");
    }
  }

  private async assertZoneMember(userId: string, zoneId: string) {
    const membership = await this.db
      .select()
      .from(userZoneMemberships)
      .where(
        and(
          eq(userZoneMemberships.userId, userId),
          eq(userZoneMemberships.zoneId, zoneId),
          eq(userZoneMemberships.status, "JOINED"),
        ),
      )
      .limit(1);

    if (!membership[0]) {
      throw new PickiError("FORBIDDEN", "Join the Zone before managing addresses");
    }
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
