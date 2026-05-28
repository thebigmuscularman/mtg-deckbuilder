import { z } from "zod";
import { shoreUpDeckWithAI } from "@/lib/ai/flows";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import { brewRequestFields, builtDeckBodySchema } from "@/lib/api-schemas";
import {
  badRequest,
  deckResponse,
  playableFrom,
  serverError,
} from "@/lib/api-route-helpers";
import type { BuiltDeck } from "@/lib/types";

const bodySchema = z.object({
  ...brewRequestFields,
  deck: builtDeckBodySchema,
  // Optional override (e.g. "Rebuild toward target power") — when supplied
  // these take precedence over the deck's own `weaknesses` array.
  weaknesses: z.array(z.string()).optional(),
});

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    const { format, resolved, deck, strategy, colors, budgetMax } = parsed.data;
    const overrideWeaknesses =
      parsed.data.weaknesses?.filter((w) => w.trim().length > 0) ?? [];
    const deckWeaknesses =
      deck.weaknesses?.filter((w) => w.trim().length > 0) ?? [];
    const weaknesses = overrideWeaknesses.length
      ? overrideWeaknesses
      : deckWeaknesses;
    if (!weaknesses.length) {
      return badRequest("Deck has no listed weaknesses to address.");
    }

    const brewPrefs = brewPreferencesFromBody(parsed.data);
    const playable = playableFrom(resolved);
    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };

    const result = await shoreUpDeckWithAI({
      format,
      resolved: playable,
      previousDeck,
      weaknesses,
      strategyHint: strategy,
      colorPref: colors,
      maxBudgetUsd: budgetMax,
      brewPrefs,
    });
    return deckResponse(result, playable, brewPrefs.allowIllegal);
  } catch (err) {
    return serverError(err, "Shore-up failed");
  }
}
