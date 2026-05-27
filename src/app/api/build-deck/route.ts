import { z } from "zod";
import { buildDeckWithAI } from "@/lib/ai-deckbuilder";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import { brewRequestFields } from "@/lib/api-schemas";
import {
  badRequest,
  deckResponse,
  playableFrom,
  serverError,
} from "@/lib/api-route-helpers";

const bodySchema = z.object(brewRequestFields);

export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid request", parsed.error.flatten());

    const { format, resolved, strategy, colors, budgetMax } = parsed.data;
    const brewPrefs = brewPreferencesFromBody(parsed.data);
    const playable = playableFrom(resolved);

    if (playable.length < 10) {
      return badRequest("Need at least 10 resolved cards to build a deck.");
    }

    const result = await buildDeckWithAI({
      format,
      resolved: playable,
      strategyHint: strategy,
      colorPref: colors,
      maxBudgetUsd: budgetMax,
      brewPrefs,
    });
    return deckResponse(result, playable, brewPrefs.allowIllegal);
  } catch (err) {
    return serverError(err, "Deck build failed");
  }
}
