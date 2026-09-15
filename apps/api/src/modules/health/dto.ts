import { z } from "zod";

/**
 * Nhắc tái khám — chỉ nhận khách + mốc giờ.
 * Không nhận lý do/triệu chứng: Picki không lưu dữ liệu sức khỏe (§86).
 */
export const createHealthFollowupSchema = z.object({
  locationId: z.string().uuid(),
  customerUserId: z.string().uuid(),
  remindAt: z.string().datetime({ offset: true }),
});
