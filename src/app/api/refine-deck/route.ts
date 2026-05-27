import { z } from "zod";
import { refineDeckWithAI } from "@/lib/ai-deckbuilder";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import {
  brewRequestFields,
  builtDeckBodySchema,
  resolvedCollectionSchema,
} from "@/lib/api-schemas";
import {
  badRequest,
  deckResponse,
  playableFrom,
  serverError,
} from "@/lib/api-route-helpers";
import type { BuiltDeck } from "@/lib/types";

const bodySchema = z.object({
  ...brewRequestFields,
  resolved: resolvedCollectionSchema,
  deck: builtDeckBodySchema,
  errors: z.array(z.string()),
});

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    const { format, resolved, deck, errors, strategy, colors, budgetMax } =
      parsed.data;
    if (!errors.length) return badRequest("No errors provided to fix.");

    const brewPrefs = brewPreferencesFromBody(parsed.data);
    const playable = playableFrom(resolved);
    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };

    const result = await refineDeckWithAI({
      format,
      resolved: playable,
      previousDeck,
      errors,
      strategyHint: strategy,
      colorPref: colors,
      maxBudgetUsd: budgetMax,
      brewPrefs,
    });
    return deckResponse(result, playable, brewPrefs.allowIllegal);
  } catch (err) {
    return serverError(err, "Refine failed");
  }
}
