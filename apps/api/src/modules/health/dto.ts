import { z } from "zod";
import { HEALTH_FOLLOWUP_MAX_DAYS } from "@picki/db";

/**
 * Nhắc tái khám — bác sĩ chỉ nhập số ngày sau lần khám.
 * Không nhận lý do/triệu chứng: Picki không lưu dữ liệu sức khỏe (§86).
 */
export const createHealthFollowupSchema = z.object({
  locationId: z.string().uuid(),
  customerUserId: z.string().uuid(),
  days: z.number().int().min(1).max(HEALTH_FOLLOWUP_MAX_DAYS),
});
