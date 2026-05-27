import { z } from "zod";
import { buildDeckWithAI, type DeckBuildProgress } from "@/lib/ai-deckbuilder";
import { brewPreferencesFromBody } from "@/lib/api-brew-body";
import { brewRequestFields } from "@/lib/api-schemas";
import { validateDeck } from "@/lib/deck-validation";
import type { FormatId, ResolvedCollectionCard } from "@/lib/types";

const bodySchema = z.object(brewRequestFields);

export const maxDuration = 120;

function sseLine(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = bodySchema.safeParse(json);

  if (!parsed.success) {
    return new Response(
      sseLine("error", { error: "Invalid request" }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const { format, resolved, strategy, colors, budgetMax } = parsed.data;
  const brewPrefs = brewPreferencesFromBody(parsed.data);
  const playable = resolved.filter((r) => r.card) as ResolvedCollectionCard[];

  if (playable.length < 10) {
    return new Response(
      sseLine("error", { error: "Need at least 10 resolved cards." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseLine(event, data)));
      };

      try {
        send("progress", { type: "status", message: "Starting brew…" });

        const { deck, validationErrors } = await buildDeckWithAI(
          format as FormatId,
          playable,
          strategy,
          colors,
          budgetMax,
          (ev: DeckBuildProgress) => send("progress", ev),
          brewPrefs,
        );

        const validation = validateDeck(deck, playable);

        send("done", {
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
        const message = err instanceof Error ? err.message : "Build failed";
        send("error", { error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
