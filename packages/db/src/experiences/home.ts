export type HomeCandidate = {
  id: string;
  featuredRank: number | null;
  startAt: Date;
};

export type HomeSelection<T extends HomeCandidate> = {
  items: T[];
  source: "rotation" | "empty";
};

/** One step of the home rotation. Every live show spends the same time in each slot. */
export const HOME_EXPERIENCE_ROTATE_MS = 7_500;

/**
 * Every show still inside the time window is returned, in a rotating order.
 * featured_rank does not pin a show to the top or hide the others.
 */
export function selectHomeExperiences<T extends HomeCandidate>(
  fitting: T[],
  now: Date = new Date(),
): HomeSelection<T> {
  if (fitting.length === 0) return { items: [], source: "empty" };
  const ordered = [...fitting].sort((a, b) => a.id.localeCompare(b.id));
  const offset = Math.floor(now.getTime() / HOME_EXPERIENCE_ROTATE_MS) % ordered.length;
  return {
    items: [...ordered.slice(offset), ...ordered.slice(0, offset)],
    source: "rotation",
  };
}
