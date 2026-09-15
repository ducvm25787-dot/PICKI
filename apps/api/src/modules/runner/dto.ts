import { z } from "zod";

export const runnerOrderActionSchema = z.object({
  action: z.enum(["accept", "skip", "picked_up", "delivering", "delivered"]),
});

export const updatePresenceSchema = z.object({
  status: z.enum(["OFFLINE", "AVAILABLE", "PICKING_UP", "DELIVERING"]),
});
