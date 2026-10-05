import { describe, expect, it } from "vitest";
import { resolveSessionApp, staffAppsForRoles } from "./auth.js";

describe("admin login doors", () => {
  it("opens the admin app for super admin and city admin", () => {
    expect(staffAppsForRoles(["SUPER_ADMIN"])).toContain("admin");
    expect(staffAppsForRoles(["CITY_ADMIN"])).toContain("admin");
    expect(resolveSessionApp("admin", ["SUPER_ADMIN"])).toBe("admin");
    expect(resolveSessionApp("admin", ["CITY_ADMIN"])).toBe("admin");
  });
});
