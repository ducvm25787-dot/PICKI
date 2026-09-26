export type HomeCandidate = {
  id: string;
  featuredRank: number | null;
  startAt: Date;
};

export type HomeSelection<T extends HomeCandidate> = {
  items: T[];
  source: "featured" | "fallback" | "empty";
};

/**
 * featured_rank sorts editorial priority inside the time window.
 * It does not decide whether the Home card exists.
 */
export function selectHomeExperiences<T extends HomeCandidate>(
  fitting: T[],
  limit = 3,
): HomeSelection<T> {
  if (fitting.length === 0) return { items: [], source: "empty" };
  const featured = fitting.filter((item) => item.featuredRank != null && item.featuredRank > 0);
  if (featured.length > 0) {
    featured.sort(byRankThenStart);
    return { items: featured.slice(0, limit), source: "featured" };
  }
  const fallback = [...fitting].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return { items: fallback.slice(0, limit), source: "fallback" };
}

function byRankThenStart(a: HomeCandidate, b: HomeCandidate): number {
  const rank = (a.featuredRank ?? 0) - (b.featuredRank ?? 0);
  if (rank !== 0) return rank;
  return a.startAt.getTime() - b.startAt.getTime();
}
