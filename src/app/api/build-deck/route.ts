import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeckWithAI } from "@/lib/ai-deckbuilder";
import {
  brewPreferencesFields,
  brewPreferencesFromBody,
} from "@/lib/api-brew-body";
import { validateDeck } from "@/lib/deck-validation";
import type { FormatId, ResolvedCollectionCard } from "@/lib/types";

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
  strategy: z.string().optional(),
  colors: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
<<<<<<< Updated upstream
=======
  budgetMax: z.number().positive().optional(),
  ...brewPreferencesFields,
>>>>>>> Stashed changes
});

export const maxDuration = 120;

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

<<<<<<< Updated upstream
    const { format, resolved, strategy, colors } = parsed.data;
=======
    const { format, resolved, strategy, colors, budgetMax, ...prefBody } =
      parsed.data;
    const brewPrefs = brewPreferencesFromBody(prefBody);
>>>>>>> Stashed changes
    const playable = resolved.filter((r) => r.card) as ResolvedCollectionCard[];

    if (playable.length < 10) {
      return NextResponse.json(
        { error: "Need at least 10 resolved cards to build a deck." },
        { status: 400 },
      );
    }

    const { deck, validationErrors } = await buildDeckWithAI(
      format as FormatId,
      playable,
      strategy,
      colors,
<<<<<<< Updated upstream
=======
      budgetMax,
      undefined,
      brewPrefs,
>>>>>>> Stashed changes
    );

    const validation = validateDeck(deck, playable);

    return NextResponse.json({
      deck,
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
    const message = err instanceof Error ? err.message : "Deck build failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
