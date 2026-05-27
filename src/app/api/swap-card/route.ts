import { z } from "zod";
import { swapCardWithAI } from "@/lib/ai-deckbuilder";
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
  cardName: z.string().min(1),
  zone: z.enum(["mainboard", "sideboard", "commander"]),
});

export const maxDuration = 90;

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

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
    const playable = playableFrom(resolved);
    const previousDeck: BuiltDeck = { ...deck, warnings: deck.warnings ?? [] };

    const result = await swapCardWithAI({
      format,
      resolved: playable,
      previousDeck,
      cardToReplace: cardName,
      zone,
      strategyHint: strategy,
      colorPref: colors,
      maxBudgetUsd: budgetMax,
      brewPrefs,
    });
    return deckResponse(result, playable, brewPrefs.allowIllegal);
  } catch (err) {
    return serverError(err, "Swap failed");
  }
}
