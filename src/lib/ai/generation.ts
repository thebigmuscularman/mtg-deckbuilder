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
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: planSystemPrompt(args.format) },
    {
      role: "user",
      content: planUserPrompt(
        args.format,
        collectionContext,
        prefColors,
        args.strategyHint,
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
      { role: "user", content: buildExecutionUserMessage(planJson) },
    ];
  }

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

    const { deck, adjustments } = applyTrim(parsed.data, args);
    if (adjustments.length) deck.warnings = [...deck.warnings, ...adjustments];
    lastTrimmedDeck = deck;

    const validation = validateDeck(deck, resolved, {
      allowIllegal: brewPrefs?.allowIllegal,
    });
    if (validation.valid) {
      onProgress?.({ type: "status", message: "Deck validated — ready!" });
      return { deck, validationErrors: [] };
    }
    lastErrors = validation.errors;
  }

  if (!lastTrimmedDeck) {
    throw new Error(`Deck generation failed: ${lastErrors.join("; ")}`);
  }
  lastTrimmedDeck.warnings = [...lastTrimmedDeck.warnings, ...lastErrors];
  return { deck: lastTrimmedDeck, validationErrors: lastErrors };
}
