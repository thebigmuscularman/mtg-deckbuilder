import { z } from "zod";

export const aiRequiredString = z
  .union([z.string(), z.null()])
  .refine((v): v is string => typeof v === "string" && v.trim().length > 0, {
    message: "expected non-empty string",
  });

export const aiOptionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));

export const cardLineSchema = z.object({
  name: aiRequiredString,
  quantity: z.number().int().positive(),
  reason: aiOptionalString,
});

const stringList = z
  .array(z.union([z.string(), z.null()]))
  .optional()
  .transform((arr) =>
    arr?.filter((w): w is string => typeof w === "string" && w.trim().length > 0),
  );

export const deckSchema = z.object({
  name: aiRequiredString,
  description: aiRequiredString,
  commander: z.union([z.string(), z.null()]),
  commanderReason: aiOptionalString,
  archetype: aiOptionalString,
  overview: aiOptionalString,
  winConditions: stringList,
  strengths: stringList,
  weaknesses: stringList,
  mainboard: z.array(cardLineSchema),
  sideboard: z.array(cardLineSchema),
  strategy: aiRequiredString,
  warnings: stringList,
});

export const swapResponseSchema = z.object({
  replacements: z.array(
    z.object({
      name: aiRequiredString,
      quantity: z.number().int().positive(),
      reason: aiOptionalString,
    }),
  ),
});

export const roleCountsSchema = z.object({
  lands: z.number().int().nonnegative(),
  ramp: z.number().int().nonnegative(),
  removal: z.number().int().nonnegative(),
  cardDraw: z.number().int().nonnegative(),
  threats: z.number().int().nonnegative(),
  payoffs: z.number().int().nonnegative(),
  utility: z.number().int().nonnegative(),
});

/**
 * Strategic plan produced by stage 1. The AI commits to these decisions in
 * writing before stage 2 fills out the 99-card list, so individual card picks
 * have to serve a stated plan rather than emerging by vibes.
 */
export const deckPlanSchema = z.object({
  commander: z.union([z.string(), z.null()]),
  commanderRationale: aiOptionalString,
  archetype: aiRequiredString,
  archetypeTagline: aiRequiredString,
  winConditions: z.array(aiRequiredString).min(1).max(4),
  keyCards: z.array(aiRequiredString).min(3).max(20),
  roleCounts: roleCountsSchema,
  buildNotes: aiOptionalString,
});

export type DeckPlan = z.infer<typeof deckPlanSchema>;
