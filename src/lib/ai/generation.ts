import OpenAI from "openai";
import { validateDeck } from "../deck-validation";
import type { BuiltDeck } from "../types";
import { deckPlanSchema, deckSchema, type DeckPlan } from "./deck-schema";
import {
  buildExecutionUserMessage,
  planSystemPrompt,
  planUserPrompt,
} from "./prompts";
import { buildCollectionContext } from "./collection-prompt";
import { sortWubrg } from "./color-utils";
import { trimDeckToCollection } from "./trim";
import type { BrewArgs, DeckResult } from "./types";

const MODEL = () => process.env.OPENAI_MODEL ?? "gpt-4o-mini";

export function requireOpenAIKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to enable AI deck building.",
    );
  }
  return apiKey;
}

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

async function generatePlan(
  client: OpenAI,
  args: BrewArgs,
): Promise<DeckPlan> {
  const prefColors = sortWubrg(
    (args.colorPref ?? []).filter((c) => "WUBRG".includes(c)),
  );
  const collectionContext = buildCollectionContext(
    args.resolved,
    args.format,
    prefColors,
  );
  const chosenCommander =
    args.format === "commander"
      ? args.brewPrefs?.chosenCommander?.trim() || undefined
      : undefined;
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: planSystemPrompt(args.format, chosenCommander),
    },
    {
      role: "user",
      content: planUserPrompt(
        args.format,
        collectionContext,
        prefColors,
        args.strategyHint,
        chosenCommander,
      ),
    },
  ];

  args.onProgress?.({
    type: "status",
    message: "Planning the deck — picking commander, archetype, and key cards…",
  });

  const completion = await client.chat.completions.create({
    model: MODEL(),
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages,
  });
  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Planner returned an empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Planner returned invalid JSON");
  }
  const plan = deckPlanSchema.safeParse(parsed);
  if (!plan.success) {
    throw new Error(
      `Planner output failed validation: ${plan.error.issues
        .map((i) => `${i.path.join(".") || "plan"}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return plan.data;
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

/**
 * `extraMessages` lets refine/shore-up callers append their previous-deck
 * context AFTER the plan-driven build messages. When supplied, we skip the
 * planning step — those flows already operate on an existing deck.
 */
export async function runDeckGeneration(
  args: BrewArgs,
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts: number,
  extraMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [],
): Promise<DeckResult> {
  const { onProgress, brewPrefs, resolved } = args;
  const client = new OpenAI({ apiKey: requireOpenAIKey() });
  let lastErrors: string[] = [];
  let lastTrimmedDeck: BuiltDeck | null = null;

  // Stage 1: commit to a strategic plan in a separate call. Skip for refine /
  // shore-up flows — they're already anchored to an existing deck.
  let planMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (extraMessages.length === 0) {
    const plan = await generatePlan(client, args);
    const planJson = JSON.stringify(plan, null, 2);
    onProgress?.({
      type: "status",
      message: `Plan: ${plan.archetype}${plan.commander ? ` — ${plan.commander}` : ""}. Building the list…`,
    });
    planMessages = [
      { role: "assistant", content: planJson },
      {
        role: "user",
        content: buildExecutionUserMessage(planJson, args.format),
      },
    ];
  }

  const targetMainSize = args.format === "commander" ? 99 : 60;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      ...baseMessages,
      ...planMessages,
      ...extraMessages,
    ];
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
          ? "Building the deck list against the plan…"
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

    // Pre-trim size gate: the AI must return the exact mainboard quantity on
    // its own. We retry on every miss — trim's basic-padding is no longer an
    // escape hatch, so a too-short list never makes it past this loop.
    const rawMainSize = parsed.data.mainboard.reduce(
      (s, l) => s + l.quantity,
      0,
    );
    const sizeDelta = rawMainSize - targetMainSize;
    if (sizeDelta !== 0) {
      const direction = sizeDelta < 0 ? "short" : "over";
      const abs = Math.abs(sizeDelta);
      lastErrors = [
        `Mainboard quantity sum = ${rawMainSize}, but it MUST be exactly ${targetMainSize} (you were ${abs} ${direction}). Add or remove cards from the collection until the mainboard quantities sum to ${targetMainSize}. Every slot must be filled from the collection — basic lands are always available if you need to round out the mana base.`,
      ];
      onProgress?.({
        type: "status",
        message: `Mainboard was ${abs} ${direction} (${rawMainSize}/${targetMainSize}) — asking the model to fix it…`,
      });
      continue;
    }

    const { deck, adjustments } = applyTrim(parsed.data, args);
    if (adjustments.length) deck.warnings = [...deck.warnings, ...adjustments];

    // Post-trim size gate: trim may have removed illegal/wrong-color cards.
    // If that drops us under target, the deck is unfit to ship — retry instead
    // of returning a short list with a warning slapped on it.
    const trimmedMainSize = deck.mainboard.reduce(
      (s, l) => s + l.quantity,
      0,
    );
    const commanderCount =
      args.format === "commander" && deck.commander ? 1 : 0;
    const targetTotal = targetMainSize + commanderCount;
    const finalTotal = trimmedMainSize + commanderCount;
    if (finalTotal !== targetTotal) {
      lastErrors = [
        `After trimming illegal or out-of-color cards, mainboard was ${trimmedMainSize}/${targetMainSize}` +
          (args.format === "commander" && !deck.commander
            ? " and no valid commander was set"
            : "") +
          `. Return a fresh ${targetMainSize}-card mainboard using only legal collection cards that match the commander's color identity (basic lands always allowed).`,
      ];
      lastTrimmedDeck = deck;
      onProgress?.({
        type: "status",
        message: `Trim left ${finalTotal}/${targetTotal} cards — asking the model to rebuild…`,
      });
      continue;
    }

    const validation = validateDeck(deck, resolved, {
      allowIllegal: brewPrefs?.allowIllegal,
    });
    if (validation.valid) {
      onProgress?.({ type: "status", message: "Deck validated — ready!" });
      return { deck, validationErrors: [] };
    }
    lastErrors = validation.errors;
    lastTrimmedDeck = deck;
  }

  // Strict mode: never ship a wrong-sized deck. Throwing surfaces as a 500 to
  // the API route, which is the correct UX for "we couldn't make it work" —
  // it's better than handing the user a 59-card Commander deck.
  const summary = lastTrimmedDeck
    ? ` Last attempt was ${lastTrimmedDeck.mainboard.reduce((s, l) => s + l.quantity, 0)}/${targetMainSize} mainboard cards${
        args.format === "commander" && lastTrimmedDeck.commander
          ? ` + ${lastTrimmedDeck.commander}`
          : ""
      }.`
    : "";
  throw new Error(
    `Couldn't build a complete ${args.format} deck after ${maxAttempts} attempts.${summary} The AI may be returning short lists for this collection — try widening colors, adding more cards, relaxing budget/ban filters, or simplifying the strategy brief.`,
  );
}
