import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { userIdentities, userRoles, users, type PickiDb } from "@picki/db";
import {
  PickiError,
  type AuthUserDto,
  type IdentityProviderKind,
  type UserRole,
} from "@picki/shared";
import { PICKI_DB } from "../../shared/tokens.js";

export type UserRecord = typeof users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(@Inject(PICKI_DB) private readonly db: PickiDb) {}

  async findById(id: string): Promise<UserRecord | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0];
  }

  async findByIdentity(
    provider: IdentityProviderKind,
    externalUserId: string,
  ): Promise<UserRecord | undefined> {
    const rows = await this.db
      .select({ user: users })
      .from(userIdentities)
      .innerJoin(users, eq(userIdentities.userId, users.id))
      .where(
        and(
          eq(userIdentities.provider, provider),
          eq(userIdentities.externalUserId, externalUserId),
        ),
      )
      .limit(1);
    return rows[0]?.user;
  }

  async listRoles(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.role);
  }

  async listIdentities(
    userId: string,
  ): Promise<{ provider: string; externalUserId: string }[]> {
    const rows = await this.db
      .select({
        provider: userIdentities.provider,
        externalUserId: userIdentities.externalUserId,
      })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId));
    return rows;
  }

  async toAuthDto(user: UserRecord): Promise<AuthUserDto> {
    const [roles, identities] = await Promise.all([
      this.listRoles(user.id),
      this.listIdentities(user.id),
    ]);
    return {
      id: user.id,
      displayName: user.displayName,
      activeZoneId: user.activeZoneId,
      roles,
      identities,
    };
  }

  async findOrCreateByIdentity(
    provider: IdentityProviderKind,
    externalUserId: string,
    displayName?: string,
  ): Promise<UserRecord> {
    const existing = await this.findByIdentity(provider, externalUserId);
    if (existing) return existing;

    return this.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ displayName: displayName ?? null })
        .returning();

      if (!user) {
        throw new Error("Failed to create user");
      }

      await tx.insert(userIdentities).values({
        userId: user.id,
        provider,
        externalUserId,
        verifiedAt: new Date(),
      });

      await tx.insert(userRoles).values({
        userId: user.id,
        role: "CUSTOMER" satisfies UserRole,
      });

      return user;
    });
  }

  async updateProfile(
    userId: string,
    patch: { displayName?: string | null; activeZoneId?: string | null },
  ): Promise<UserRecord> {
    const [updated] = await this.db
      .update(users)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName } : {}),
        ...(patch.activeZoneId !== undefined
          ? { activeZoneId: patch.activeZoneId }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (!updated) {
      throw new PickiError("NOT_FOUND", "User not found");
    }
    return updated;
  }
}
