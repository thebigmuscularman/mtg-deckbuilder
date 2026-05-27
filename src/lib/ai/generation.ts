import OpenAI from "openai";
import { validateDeck } from "../deck-validation";
import type { BuiltDeck } from "../types";
import { deckSchema } from "./deck-schema";
import { trimDeckToCollection } from "./trim";
import type { BrewArgs, DeckResult } from "./types";

const MODEL = () => process.env.OPENAI_MODEL ?? "gpt-4o-mini";

async function getRawCompletion(
  client: OpenAI,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  onProgress?: BrewArgs["onProgress"],
): Promise<string> {
  if (!onProgress) {
    const completion = await client.chat.completions.create({
      model: MODEL(),
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages,
    });
    return completion.choices[0]?.message?.content ?? "";
  }
  let raw = "";
  const stream = await client.chat.completions.create({
    model: MODEL(),
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) {
      raw += delta;
      onProgress({ type: "token", delta });
    }
  }
  return raw;
}

function applyTrim(
  raw: ReturnType<typeof deckSchema.parse>,
  args: BrewArgs,
): { deck: BuiltDeck; adjustments: string[] } {
  const rawDeck: BuiltDeck = {
    ...raw,
    format: args.format,
    warnings: raw.warnings ?? [],
  };
  return trimDeckToCollection(
    rawDeck,
    args.resolved,
    args.colorPref,
    args.maxBudgetUsd,
    args.brewPrefs,
  );
}

export async function runDeckGeneration(
  args: BrewArgs,
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts: number,
): Promise<DeckResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to enable AI deck building.",
    );
  }
  const { onProgress, brewPrefs, resolved } = args;
  const client = new OpenAI({ apiKey });
  let lastErrors: string[] = [];
  let parsedDeck: ReturnType<typeof deckSchema.parse> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [...baseMessages];
    if (attempt > 0 && lastErrors.length) {
      messages.push({
        role: "user",
        content: `Your previous list failed validation. Fix ALL issues and return corrected JSON only:\n${lastErrors.map((e) => `- ${e}`).join("\n")}`,
      });
    }

    onProgress?.({ type: "attempt", attempt: attempt + 1, maxAttempts });
    onProgress?.({
      type: "status",
      message:
        attempt === 0
          ? "Reading your collection and drafting a deck list…"
          : `Fixing ${lastErrors.length} validation issue${lastErrors.length === 1 ? "" : "s"}…`,
    });

    const raw = await getRawCompletion(client, messages, onProgress);
    if (!raw) throw new Error("AI returned an empty response");

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("AI returned invalid JSON");
    }

    const parsed = deckSchema.safeParse(json);
    if (!parsed.success) {
      lastErrors = parsed.error.issues.map(
        (i) => `${i.path.join(".") || "deck"}: ${i.message}`,
      );
      continue;
    }
    parsedDeck = parsed.data;

    const { deck, adjustments } = applyTrim(parsed.data, args);
    if (adjustments.length) deck.warnings = [...deck.warnings, ...adjustments];

    const validation = validateDeck(deck, resolved, {
      allowIllegal: brewPrefs?.allowIllegal,
    });
    if (validation.valid) {
      onProgress?.({ type: "status", message: "Deck validated — ready!" });
      return { deck, validationErrors: [] };
    }
    lastErrors = validation.errors;
  }

  if (!parsedDeck) {
    throw new Error(`Deck generation failed: ${lastErrors.join("; ")}`);
  }
  const { deck, adjustments } = applyTrim(parsedDeck, args);
  deck.warnings = [...deck.warnings, ...adjustments, ...lastErrors];
  return { deck, validationErrors: lastErrors };
}
