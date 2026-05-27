import { NextResponse } from "next/server";
import { z } from "zod";
import { refineDeckWithAI } from "@/lib/ai-deckbuilder";
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
  errors: z.array(z.string()),
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

    const { format, resolved, deck, errors, strategy, colors, budgetMax } =
      parsed.data;
    const brewPrefs = brewPreferencesFromBody(parsed.data);
    const playable = resolved.filter((r) => r.card) as ResolvedCollectionCard[];

    if (!errors.length) {
      return NextResponse.json(
        { error: "No errors provided to fix." },
        { status: 400 },
      );
    }

    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };

    const { deck: refinedDeck, validationErrors } = await refineDeckWithAI(
      format as FormatId,
      playable,
      previousDeck,
      errors,
      strategy,
      colors,
      budgetMax,
      undefined,
      brewPrefs,
    );

    const validation = validateDeck(refinedDeck, playable);

    return NextResponse.json({
      deck: refinedDeck,
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
    const message = err instanceof Error ? err.message : "Refine failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
