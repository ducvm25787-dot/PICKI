import { describe, expect, it } from "vitest";
import {
  canConfigureZone,
  canOperateLocation,
  canOperateZone,
  canReadCity,
  canReadFinance,
  canReadGlobal,
  canReadZone,
  canWriteCity,
  canWriteGlobal,
  resolveAdminAccess,
} from "./admin-access.js";

const zoneA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const zoneB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const hanoi = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const hcmc = "dddddddd-dddd-dddd-dddd-dddddddddddd";

describe("resolveAdminAccess", () => {
  it("reads every role instead of stopping at the first row", () => {
    const access = resolveAdminAccess([
      { role: "ZONE_ADMIN", scopeType: "ZONE", scopeId: zoneA },
      { role: "SUPER_ADMIN", scopeType: null, scopeId: null },
    ]);
    expect(access?.superAdmin).toBe(true);
    expect(access?.zones[zoneA]).toBe("admin");
    expect(canWriteGlobal(access!)).toBe(true);
    expect(canReadZone(access!, zoneB)).toBe(true);
  });

  it("keeps unscoped support read-only and blocks zone writes", () => {
    const access = resolveAdminAccess([{ role: "SUPPORT", scopeType: null, scopeId: null }]);
    expect(access?.supportReadOnlyGlobal).toBe(true);
    expect(canReadGlobal(access!)).toBe(true);
    expect(canWriteGlobal(access!)).toBe(false);
    expect(canReadZone(access!, zoneA)).toBe(false);
    expect(canOperateZone(access!, zoneA)).toBe(false);
  });

  it("scopes support to one zone without write", () => {
    const access = resolveAdminAccess([{ role: "SUPPORT", scopeType: "ZONE", scopeId: zoneA }]);
    expect(access?.supportReadOnlyGlobal).toBe(false);
    expect(canReadZone(access!, zoneA)).toBe(true);
    expect(canOperateZone(access!, zoneA)).toBe(false);
    expect(canReadZone(access!, zoneB)).toBe(false);
  });

  it("lets a zone operator work in one zone and not configure fees", () => {
    const access = resolveAdminAccess([{ role: "ZONE_OPERATOR", scopeType: "ZONE", scopeId: zoneA }]);
    expect(canOperateZone(access!, zoneA)).toBe(true);
    expect(canConfigureZone(access!, zoneA)).toBe(false);
    expect(canOperateZone(access!, zoneB)).toBe(false);
    expect(canReadGlobal(access!)).toBe(false);
  });

  it("ignores an unscoped zone admin row", () => {
    expect(resolveAdminAccess([{ role: "ZONE_ADMIN", scopeType: null, scopeId: null }])).toBeNull();
  });

  it("lets a city admin edit that city and not system config or another city", () => {
    const access = resolveAdminAccess([{ role: "CITY_ADMIN", scopeType: "CITY", scopeId: hanoi }]);
    expect(canWriteCity(access!, hanoi)).toBe(true);
    expect(canReadCity(access!, hanoi)).toBe(true);
    expect(canWriteCity(access!, hcmc)).toBe(false);
    expect(canReadCity(access!, hcmc)).toBe(false);
    expect(canWriteGlobal(access!)).toBe(false);
    expect(canReadGlobal(access!)).toBe(false);
    expect(canOperateZone(access!, zoneA)).toBe(false);
  });

  it("keeps zone admin out of city content", () => {
    const access = resolveAdminAccess([{ role: "ZONE_ADMIN", scopeType: "ZONE", scopeId: zoneA }]);
    expect(canReadCity(access!, hanoi)).toBe(false);
    expect(canWriteCity(access!, hanoi)).toBe(false);
    expect(canConfigureZone(access!, zoneA)).toBe(true);
  });

  it("applies city and zone roles together", () => {
    const access = resolveAdminAccess([
      { role: "ZONE_OPERATOR", scopeType: "ZONE", scopeId: zoneA },
      { role: "CITY_ADMIN", scopeType: "CITY", scopeId: hanoi },
    ]);
    expect(canOperateZone(access!, zoneA)).toBe(true);
    expect(canConfigureZone(access!, zoneA)).toBe(false);
    expect(canWriteCity(access!, hanoi)).toBe(true);
    expect(canWriteGlobal(access!)).toBe(false);
  });

  it("ignores an unscoped city admin", () => {
    expect(resolveAdminAccess([{ role: "CITY_ADMIN", scopeType: null, scopeId: null }])).toBeNull();
  });

  it("keeps city support read-only for that city", () => {
    const access = resolveAdminAccess([{ role: "SUPPORT", scopeType: "CITY", scopeId: hanoi }]);
    expect(canReadCity(access!, hanoi)).toBe(true);
    expect(canWriteCity(access!, hanoi)).toBe(false);
    expect(canReadCity(access!, hcmc)).toBe(false);
    expect(canReadGlobal(access!)).toBe(false);
  });

  it("lets unscoped support read city content without writing it", () => {
    const access = resolveAdminAccess([{ role: "SUPPORT", scopeType: null, scopeId: null }]);
    expect(canReadCity(access!, hanoi)).toBe(true);
    expect(canWriteCity(access!, hanoi)).toBe(false);
  });

  it("scopes finance without granting system or city content writes", () => {
    const globalFinance = resolveAdminAccess([{ role: "FINANCE", scopeType: null, scopeId: null }]);
    expect(canReadFinance(globalFinance!, { scope: "GLOBAL" })).toBe(true);
    expect(canReadFinance(globalFinance!, { scope: "ZONE", id: zoneA })).toBe(true);
    expect(canWriteGlobal(globalFinance!)).toBe(false);
    expect(canWriteCity(globalFinance!, hanoi)).toBe(false);
    expect(canOperateZone(globalFinance!, zoneA)).toBe(false);

    const zoneFinance = resolveAdminAccess([{ role: "FINANCE", scopeType: "ZONE", scopeId: zoneA }]);
    expect(canReadFinance(zoneFinance!, { scope: "ZONE", id: zoneA })).toBe(true);
    expect(canReadFinance(zoneFinance!, { scope: "ZONE", id: zoneB })).toBe(false);
    expect(canReadFinance(zoneFinance!, { scope: "GLOBAL" })).toBe(false);
    expect(canReadZone(zoneFinance!, zoneA)).toBe(false);
  });

  it("refuses a location that also serves a zone the admin cannot operate", () => {
    const access = resolveAdminAccess([{ role: "ZONE_ADMIN", scopeType: "ZONE", scopeId: zoneA }]);
    expect(canOperateLocation(access!, [zoneA], zoneA)).toBe(true);
    expect(canOperateLocation(access!, [zoneA, zoneB], zoneA)).toBe(false);
    expect(canOperateLocation(access!, [zoneB], zoneA)).toBe(false);
  });
});
