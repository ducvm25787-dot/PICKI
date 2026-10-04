import { eq } from "drizzle-orm";
import { users, type PickiDb } from "@picki/db";
import { isAtLeast18 } from "@picki/shared";

export async function viewerCanSeeDraftBeer(
  db: PickiDb,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({
      declaredDateOfBirth: users.declaredDateOfBirth,
      ageDeclaredAt: users.ageDeclaredAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row?.ageDeclaredAt || !row.declaredDateOfBirth) return false;
  return isAtLeast18(row.declaredDateOfBirth);
}
