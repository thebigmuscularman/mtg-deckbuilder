import { z } from "zod";
import { brewPreferencesFields } from "./api-brew-body";

export const FORMAT_IDS = [
  "standard",
  "modern",
  "pioneer",
  "pauper",
  "commander",
] as const;

export const formatIdSchema = z.enum(FORMAT_IDS);

export const resolvedCollectionSchema = z.array(
  z.object({
    entry: z.object({
      name: z.string(),
      quantity: z.number(),
      set: z.string().optional(),
      collectorNumber: z.string().optional(),
    }),
    card: z.any().nullable(),
    error: z.string().optional(),
  }),
);

export const cardLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  scryfallId: z.string().optional(),
  reason: z.string().optional(),
});

export const builtDeckBodySchema = z.object({
  name: z.string(),
  description: z.string(),
  commander: z.string().nullable(),
  commanderReason: z.string().optional(),
  archetype: z.string().optional(),
  overview: z.string().optional(),
  winConditions: z.array(z.string()).optional(),
  strengths: z.array(z.string()).optional(),
  weaknesses: z.array(z.string()).optional(),
  mainboard: z.array(cardLineSchema),
  sideboard: z.array(cardLineSchema),
  strategy: z.string(),
  warnings: z.array(z.string()).default([]),
  format: formatIdSchema,
});

export const brewRequestFields = {
  format: formatIdSchema,
  resolved: resolvedCollectionSchema,
  strategy: z.string().optional(),
  colors: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
  budgetMax: z.number().positive().optional(),
  ...brewPreferencesFields,
};
