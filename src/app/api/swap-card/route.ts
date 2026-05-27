import { NextResponse } from "next/server";
import { z } from "zod";
import { swapCardWithAI } from "@/lib/ai-deckbuilder";
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
  cardName: z.string().min(1),
  zone: z.enum(["mainboard", "sideboard", "commander"]),
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

    const {
      format,
      resolved,
      deck,
      cardName,
      zone,
      strategy,
      colors,
      budgetMax,
    } = parsed.data;
    const brewPrefs = brewPreferencesFromBody(parsed.data);
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
      brewPrefs,
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
