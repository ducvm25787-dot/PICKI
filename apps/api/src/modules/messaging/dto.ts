import { z } from "zod";

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(2000).optional(),
    photoUrls: z.array(z.string().max(500)).max(3).optional(),
  })
  .superRefine((val, ctx) => {
    const text = val.body?.trim() ?? "";
    const photos = val.photoUrls ?? [];
    if (!text && photos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Nhập tin nhắn hoặc kèm ít nhất 1 ảnh",
      });
    }
  });
