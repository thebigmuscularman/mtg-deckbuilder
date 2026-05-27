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
