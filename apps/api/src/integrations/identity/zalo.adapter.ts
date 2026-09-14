import type { IdentityAdapter } from "@picki/shared";

/** Sprint 2: map Zalo session → user_identities. Never use Zalo UID as users.id. */
export const zaloIdentityAdapter: IdentityAdapter = {
  kind: "ZALO",
  async verifyExternalSession() {
    throw new Error("Zalo identity adapter is not implemented (Sprint 2+)");
  },
};
