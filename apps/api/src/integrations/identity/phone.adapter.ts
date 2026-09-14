import type { IdentityAdapter } from "@picki/shared";

/**
 * External Phone identity provider (future SMS/vendor SDK).
 * Sprint 2 Web login uses AuthService OTP flow + `user_identities`, not this adapter.
 */
export const phoneIdentityAdapter: IdentityAdapter = {
  kind: "PHONE",
  async verifyExternalSession() {
    throw new Error(
      "Phone identity adapter is not wired — use POST /v1/auth/otp/* (Sprint 2)",
    );
  },
};
