import { z } from "zod";
import { buildDeckWithAI } from "@/lib/ai/flows";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import { brewRequestFields } from "@/lib/api-schemas";
import { playableFrom } from "@/lib/api-route-helpers";
import { validateDeck } from "@/lib/deck-validation";

const bodySchema = z.object(brewRequestFields);

export const maxDuration = 120;

const sse = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const sseHeaders = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response(sse("error", { error: "Invalid request" }), {
      status: 400,
      headers: sseHeaders,
    });
  }

  const { format, resolved, strategy, colors, budgetMax } = parsed.data;
  const brewPrefs = brewPreferencesFromBody(parsed.data);
  const playable = playableFrom(resolved);

  if (playable.length < 10) {
    return new Response(
      sse("error", { error: "Need at least 10 resolved cards." }),
      { status: 400, headers: sseHeaders },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)));
      try {
        send("progress", { type: "status", message: "Starting brew…" });
        const { deck, validationErrors } = await buildDeckWithAI({
          format,
          resolved: playable,
          strategyHint: strategy,
          colorPref: colors,
          maxBudgetUsd: budgetMax,
          onProgress: (ev) => send("progress", ev),
          brewPrefs,
        });
        const v = validateDeck(deck, playable, {
          allowIllegal: brewPrefs.allowIllegal,
        });
        send("done", {
          deck,
          validation: { valid: v.valid, errors: v.errors, warnings: v.warnings },
          validationErrors,
          enriched: {
            mainboard: v.enrichedMainboard,
            sideboard: v.enrichedSideboard,
            commander: v.commanderCard,
          },
        });
      } catch (err) {
        send("error", {
          error: err instanceof Error ? err.message : "Build failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}
