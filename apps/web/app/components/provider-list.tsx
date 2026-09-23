import type { ProviderListing } from "../../lib/providers";
import { ProviderCardCompact } from "./provider-card-compact";

export function ProviderList({
  providers,
  favoriteIds,
  onToggleFavorite,
}: {
  providers: ProviderListing[];
  favoriteIds?: Set<string>;
  onToggleFavorite?: (locationId: string) => void;
}) {
  if (providers.length === 0) {
    return <p className="stat">Chưa có provider phù hợp khung giờ này.</p>;
  }

  return (
    <div className="provider-list">
      {providers.map((p) => (
        <ProviderCardCompact
          key={p.locationId}
          provider={p}
          favorite={favoriteIds?.has(p.locationId)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
