import { foldText, tokenJaccard } from "./fold.js";
import type { ExperienceImport } from "./validate.js";
import { formatIctShort } from "./windows.js";

export type CatalogExperience = {
  id: string;
  title: string;
  titleFold: string;
  organizerFold: string;
  venueFold: string;
  venueName: string;
  starts: Date[];
};

export type DuplicateMatch = {
  id: string;
  title: string;
  venueName: string;
  whenLabel: string;
};

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function findPossibleDuplicate(
  incoming: ExperienceImport,
  catalog: CatalogExperience[],
): DuplicateMatch | null {
  const titleFold = foldText(incoming.title);
  const organizerFold = foldText(incoming.organizer.name);
  const venueFold = foldText(incoming.venue.name);
  const starts = incoming.occurrences.map((item) => new Date(item.startAt));

  let best: { score: number; row: CatalogExperience; when: Date | null } | null = null;
  for (const row of catalog) {
    const titleScore = titleFold === row.titleFold ? 1 : tokenJaccard(titleFold, row.titleFold);
    const sameOrganizer = organizerFold.length > 0 && organizerFold === row.organizerFold;
    const sameVenue = venueFold.length > 0 && venueFold === row.venueFold;
    const near = nearestOccurrence(starts, row.starts);
    const sameSlot = near != null && near.delta <= TWO_HOURS_MS;
    const sameDay = near != null && sameIctDay(near.incoming, near.existing);

    const strongTitle = titleScore === 1 || titleScore >= 0.72;
    const possible =
      (titleScore === 1 && (sameOrganizer || sameVenue || sameSlot || sameDay)) ||
      (strongTitle && (sameVenue || sameOrganizer) && (sameSlot || sameDay));
    if (!possible) continue;

    const score =
      titleScore * 50 +
      (sameOrganizer ? 20 : 0) +
      (sameVenue ? 20 : 0) +
      (sameSlot || sameDay ? 25 : 0);
    if (!best || score > best.score) {
      best = { score, row, when: near?.existing ?? row.starts[0] ?? null };
    }
  }

  if (!best) return null;
  return {
    id: best.row.id,
    title: best.row.title,
    venueName: best.row.venueName,
    whenLabel: best.when ? formatIctShort(best.when) : "",
  };
}

function nearestOccurrence(
  incoming: Date[],
  existing: Date[],
): { delta: number; incoming: Date; existing: Date } | null {
  let best: { delta: number; incoming: Date; existing: Date } | null = null;
  for (const left of incoming) {
    for (const right of existing) {
      const delta = Math.abs(left.getTime() - right.getTime());
      if (!best || delta < best.delta) best = { delta, incoming: left, existing: right };
    }
  }
  return best;
}

function sameIctDay(a: Date, b: Date): boolean {
  const left = new Date(a.getTime() + 7 * 60 * 60 * 1000);
  const right = new Date(b.getTime() + 7 * 60 * 60 * 1000);
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}
