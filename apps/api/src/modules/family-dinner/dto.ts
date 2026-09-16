import { z } from "zod";

export const familyDinnerCategorySchema = z.enum([
  "MAIN",
  "SIDE",
  "VEGETABLE",
  "SOUP",
  "EXTRA",
]);

export const publishFamilyDinnerMenuSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        category: familyDinnerCategorySchema,
        name: z.string().trim().min(2).max(120),
        description: z.string().trim().max(500).optional(),
        priceVnd: z.number().int().min(0),
        capacity: z.number().int().min(1).max(500).optional(),
        sortOrder: z.number().int().min(0).max(100).optional(),
        recipeVersionId: z.string().uuid().optional(),
      }),
    )
    .min(4)
    .max(40),
  windows: z
    .array(
      z.object({
        startsAt: z.string().regex(/^\d{2}:\d{2}$/),
        endsAt: z.string().regex(/^\d{2}:\d{2}$/),
        capacity: z.number().int().min(1).max(200),
      }),
    )
    .min(1)
    .max(8),
});

export const patchFamilyDinnerSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  cutoffTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  dailyCapacity: z.number().int().min(1).max(5000).nullable().optional(),
  procurementBufferPercent: z.number().int().min(0).max(100).nullable().optional(),
});

export const patchFamilyDinnerItemSchema = z
  .object({
    status: z.enum(["ACTIVE", "SOLD_OUT", "PAUSED"]).optional(),
    recipeVersionId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.recipeVersionId !== undefined, {
    message: "status or recipeVersionId required",
  });

export const lockFamilyDinnerSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const recipeIngredientLineSchema = z.object({
  ingredientName: z.string().trim().min(1).max(120),
  quantityNet: z.number().positive().max(1_000_000),
  unit: z.string().trim().min(1).max(20).default("g"),
  yieldPercentOverride: z.number().positive().max(100).optional(),
  sortOrder: z.number().int().min(0).max(200).optional(),
  category: z.string().trim().max(60).optional(),
  baseUnit: z.string().trim().min(1).max(20).optional(),
});

export const createFamilyDinnerRecipeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: familyDinnerCategorySchema.optional(),
  portionLabel: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  ingredients: z.array(recipeIngredientLineSchema).min(1).max(40),
});

export const createRecipeVersionSchema = z.object({
  portionLabel: z.string().trim().min(1).max(80).optional(),
  notes: z.string().trim().max(500).optional(),
  ingredients: z.array(recipeIngredientLineSchema).min(1).max(40),
});

export const upsertInventorySchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        onHandQuantity: z.number().min(0).max(1_000_000),
        unit: z.string().trim().min(1).max(20).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export const createLateDinnerOfferSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().min(2).max(120),
  priceVnd: z.number().int().min(0),
  etaMinutes: z.number().int().min(5).max(180).default(25),
  capacity: z.number().int().min(1).max(200).optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantityPerTray: z.number().int().min(1).max(20).default(1),
      }),
    )
    .min(1)
    .max(12),
});
