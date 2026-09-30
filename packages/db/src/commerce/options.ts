import { and, asc, eq, inArray } from "drizzle-orm";
import type { PickiDb } from "../client.js";
import { offeringOptionGroups, offeringOptions } from "../schema/catalog.js";

export type OptionChoice = {
  id: string;
  name: string;
  priceDeltaVnd: number;
};

export type OptionGroupView = {
  id: string;
  name: string;
  selection: "SINGLE" | "MULTI";
  required: boolean;
  maxSelect: number;
  options: OptionChoice[];
};

export type OptionSnapshot = {
  optionId: string;
  groupName: string;
  name: string;
  priceDeltaVnd: number;
};

/** Server price for one dish. Groups with no choices stay at the base price. */
export function resolveOptionSelection(
  groups: OptionGroupView[],
  optionIds: string[],
):
  | { ok: true; extraVnd: number; snapshot: OptionSnapshot[] }
  | { ok: false; message: string } {
  if (groups.length === 0) {
    if (optionIds.length > 0) return { ok: false, message: "Món này không có lựa chọn" };
    return { ok: true, extraVnd: 0, snapshot: [] };
  }

  const byId = new Map<string, OptionChoice & { group: OptionGroupView }>();
  for (const group of groups) {
    for (const option of group.options) {
      byId.set(option.id, { ...option, group });
    }
  }

  if (new Set(optionIds).size !== optionIds.length) {
    return { ok: false, message: "Lựa chọn bị trùng" };
  }

  const chosen = [];
  for (const id of optionIds) {
    const row = byId.get(id);
    if (!row) return { ok: false, message: "Lựa chọn không hợp lệ" };
    chosen.push(row);
  }

  for (const group of groups) {
    const inGroup = chosen.filter((row) => row.group.id === group.id);
    if (group.selection === "SINGLE" || group.required) {
      if (inGroup.length !== 1) return { ok: false, message: `Chọn một ${group.name}` };
    } else if (inGroup.length > group.maxSelect) {
      return { ok: false, message: `${group.name} chọn tối đa ${group.maxSelect}` };
    }
  }

  return {
    ok: true,
    extraVnd: chosen.reduce((sum, row) => sum + row.priceDeltaVnd, 0),
    snapshot: chosen.map((row) => ({
      optionId: row.id,
      groupName: row.group.name,
      name: row.name,
      priceDeltaVnd: row.priceDeltaVnd,
    })),
  };
}

export async function listOptionGroupsForOfferings(db: PickiDb, offeringIds: string[]) {
  const map = new Map<string, OptionGroupView[]>();
  const ids = [...new Set(offeringIds)];
  if (ids.length === 0) return map;
  const groups = await db
    .select()
    .from(offeringOptionGroups)
    .where(inArray(offeringOptionGroups.offeringId, ids))
    .orderBy(asc(offeringOptionGroups.sortOrder), asc(offeringOptionGroups.name));
  if (groups.length === 0) return map;
  const options = await db
    .select()
    .from(offeringOptions)
    .where(
      and(
        inArray(
          offeringOptions.groupId,
          groups.map((group) => group.id),
        ),
        eq(offeringOptions.active, true),
      ),
    )
    .orderBy(asc(offeringOptions.sortOrder), asc(offeringOptions.name));
  const optionsByGroup = new Map<string, OptionChoice[]>();
  for (const option of options) {
    const list = optionsByGroup.get(option.groupId) ?? [];
    list.push({ id: option.id, name: option.name, priceDeltaVnd: option.priceDeltaVnd });
    optionsByGroup.set(option.groupId, list);
  }
  for (const group of groups) {
    const choices = optionsByGroup.get(group.id) ?? [];
    if (choices.length === 0) continue;
    const view: OptionGroupView = {
      id: group.id,
      name: group.name,
      selection: group.selection === "MULTI" ? "MULTI" : "SINGLE",
      required: group.required,
      maxSelect: group.maxSelect,
      options: choices,
    };
    const list = map.get(group.offeringId) ?? [];
    list.push(view);
    map.set(group.offeringId, list);
  }
  return map;
}
