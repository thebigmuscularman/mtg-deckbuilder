import { NextResponse } from "next/server";
import { z } from "zod";
import { buildDeckWithAI } from "@/lib/ai-deckbuilder";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import { brewRequestFields } from "@/lib/api-schemas";
import { validateDeck } from "@/lib/deck-validation";
import type { FormatId, ResolvedCollectionCard } from "@/lib/types";

const bodySchema = z.object(brewRequestFields);

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

    const { format, resolved, strategy, colors, budgetMax } = parsed.data;
    const brewPrefs = brewPreferencesFromBody(parsed.data);
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
      budgetMax,
      undefined,
      brewPrefs,
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
