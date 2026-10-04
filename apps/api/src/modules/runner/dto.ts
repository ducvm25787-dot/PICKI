import { z } from "zod";

export const runnerOrderActionSchema = z.object({
  action: z.enum(["accept", "skip", "picked_up", "delivering", "delivered"]),
});

export const updatePresenceSchema = z.object({
  status: z.enum(["OFFLINE", "AVAILABLE", "PICKING_UP", "DELIVERING"]),
});

const jpegDataUrl = z.string().min(32).max(450_000);

export const runnerCredentialsSchema = z.discriminatedUnion("section", [
  z.object({
    section: z.literal("cccd"),
    cccdNumber: z.string().trim().regex(/^\d{12}$/, "CCCD gồm 12 số"),
    cccdFullName: z.string().trim().min(2).max(80),
    cccdFrontDataUrl: jpegDataUrl.optional(),
    cccdBackDataUrl: jpegDataUrl.optional(),
  }),
  z.object({
    section: z.literal("vehicle"),
    vehiclePlate: z.string().trim().min(4).max(20),
    vehicleDocDataUrl: jpegDataUrl.optional(),
  }),
  z.object({
    section: z.literal("payout"),
    payoutBankName: z.string().trim().min(2).max(80),
    payoutAccountNumber: z.string().trim().regex(/^\d{6,20}$/, "Số tài khoản 6–20 chữ số"),
    payoutAccountHolder: z.string().trim().min(2).max(80),
  }),
]);
