export const chainScopeTypes = ["PROVIDER", "CITY", "ZONE", "LOCATION"] as const;
export type ChainScopeType = (typeof chainScopeTypes)[number];

export type ChainScopeRef = {
  scopeType: ChainScopeType;
  scopeId: string;
};

export const CHAIN_SCOPE_STORAGE_KEY = "picki-chain-scope";

export const CHAIN_CONSOLE_ROUTES = [
  "/provider/organization",
  "/provider/organization/locations",
  "/provider/organization/orders",
  "/provider/organization/products",
  "/provider/organization/today",
  "/provider/organization/members",
] as const;

const SCOPE_RANK: Record<ChainScopeType, number> = {
  PROVIDER: 0,
  CITY: 1,
  ZONE: 2,
  LOCATION: 3,
};

export function isChainScopeType(value: string): value is ChainScopeType {
  return (chainScopeTypes as readonly string[]).includes(value);
}

export function encodeChainScope(scope: ChainScopeRef): string {
  return `${scope.scopeType}:${scope.scopeId}`;
}

export function decodeChainScope(value: string | null | undefined): ChainScopeRef | null {
  if (!value) return null;
  const splitAt = value.indexOf(":");
  if (splitAt <= 0) return null;
  const scopeType = value.slice(0, splitAt);
  const scopeId = value.slice(splitAt + 1);
  if (!isChainScopeType(scopeType) || !scopeId) return null;
  return { scopeType, scopeId };
}

export function parseChainScopeQuery(search: string): ChainScopeRef | null {
  const raw = search.includes("?") ? search.slice(search.indexOf("?") + 1) : search;
  const params = new URLSearchParams(raw);
  return decodeChainScope(
    params.get("scopeType") && params.get("scopeId")
      ? `${params.get("scopeType")}:${params.get("scopeId")}`
      : null,
  );
}

export function chainConsoleHref(pathname: string, scope: ChainScopeRef, extra?: string): string {
  const params = new URLSearchParams(extra ?? "");
  params.set("scopeType", scope.scopeType);
  params.set("scopeId", scope.scopeId);
  return `${pathname}?${params.toString()}`;
}

export function chainScopeIsWider(candidate: ChainScopeRef, than: ChainScopeRef): boolean {
  return SCOPE_RANK[candidate.scopeType] < SCOPE_RANK[than.scopeType];
}

/**
 * URL wins. A remembered scope wins over the widest fallback.
 * A requested scope that is not in the allowed list stays unresolved
 * instead of being replaced by a wider choice.
 */
export function resolveStickyChainScope<T extends ChainScopeRef>(input: {
  url: ChainScopeRef | null;
  remembered: ChainScopeRef | null;
  choices: readonly T[];
  fallback: T | null;
}): T | null {
  const match = (scope: ChainScopeRef | null) =>
    scope
      ? input.choices.find((choice) => choice.scopeType === scope.scopeType && choice.scopeId === scope.scopeId) ?? null
      : null;
  if (input.url) return match(input.url);
  if (input.remembered) return match(input.remembered);
  return input.fallback;
}
