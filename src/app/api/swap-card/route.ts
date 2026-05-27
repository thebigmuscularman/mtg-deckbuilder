import { NextResponse } from "next/server";
import { z } from "zod";
import { swapCardWithAI } from "@/lib/ai-deckbuilder";
import { validateDeck } from "@/lib/deck-validation";
import type { BuiltDeck, FormatId, ResolvedCollectionCard } from "@/lib/types";

const cardLineSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  scryfallId: z.string().optional(),
  reason: z.string().optional(),
});

const bodySchema = z.object({
  format: z.enum(["standard", "modern", "commander"]),
  resolved: z.array(
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
  ),
  deck: z.object({
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
    format: z.enum(["standard", "modern", "commander"]),
  }),
  cardName: z.string().min(1),
  zone: z.enum(["mainboard", "sideboard", "commander"]),
  strategy: z.string().optional(),
  colors: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
  budgetMax: z.number().positive().optional(),
});

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { format, resolved, deck, cardName, zone, strategy, colors, budgetMax } =
      parsed.data;
    const playable = resolved.filter((r) => r.card) as ResolvedCollectionCard[];
    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };

    const { deck: swapped, validationErrors } = await swapCardWithAI(
      format as FormatId,
      playable,
      previousDeck,
      cardName,
      zone,
      strategy,
      colors,
      budgetMax,
    );

    const validation = validateDeck(swapped, playable);

    return NextResponse.json({
      deck: swapped,
      validation: {
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      },
      validationErrors,
      enriched: {
        mainboard: validation.enrichedMainboard,
        sideboard: validation.enrichedSideboard,
        commander: validation.commanderCard,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Swap failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
