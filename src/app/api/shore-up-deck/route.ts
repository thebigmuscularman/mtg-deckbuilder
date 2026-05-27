import { NextResponse } from "next/server";
import { z } from "zod";
import { shoreUpDeckWithAI } from "@/lib/ai-deckbuilder";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import {
  brewRequestFields,
  builtDeckBodySchema,
  resolvedCollectionSchema,
} from "@/lib/api-schemas";
import { validateDeck } from "@/lib/deck-validation";
import type { BuiltDeck, FormatId, ResolvedCollectionCard } from "@/lib/types";

const bodySchema = z.object({
  ...brewRequestFields,
  resolved: resolvedCollectionSchema,
  deck: builtDeckBodySchema,
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

    const { format, resolved, deck, strategy, colors, budgetMax } = parsed.data;
    const brewPrefs = brewPreferencesFromBody(parsed.data);
    const playable = resolved.filter((r) => r.card) as ResolvedCollectionCard[];
    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };
    const weaknesses = deck.weaknesses?.filter((w) => w.trim().length > 0) ?? [];

    if (!weaknesses.length) {
      return NextResponse.json(
        { error: "Deck has no listed weaknesses to address." },
        { status: 400 },
      );
    }

    const { deck: revised, validationErrors } = await shoreUpDeckWithAI(
      format as FormatId,
      playable,
      previousDeck,
      weaknesses,
      strategy,
      colors,
      budgetMax,
      undefined,
      brewPrefs,
    );

    const validation = validateDeck(revised, playable);

    return NextResponse.json({
      deck: revised,
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
    const message = err instanceof Error ? err.message : "Shore-up failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
