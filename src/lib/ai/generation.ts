import OpenAI from "openai";
import { validateDeck, buildOwnedIndex } from "../deck-validation";
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
import {
  applyAutoManaBase,
  defaultLandsTargetFor,
  spellTargetFor,
} from "./mana-base";
import { nameKey } from "../scryfall";
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
  landsTarget: number,
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
      content: planSystemPrompt(args.format, chosenCommander, landsTarget),
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
  rawDeck: BuiltDeck,
  args: BrewArgs,
): { deck: BuiltDeck; adjustments: string[] } {
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

  // Auto mana base: the AI never picks lands. We compute the lands target
  // from the user's slider (or a sensible default) and the AI fills only
  // the non-land slots. After the AI returns, we strip any lands it tried
  // to sneak in and append our own mana base.
  const totalMainSize = args.format === "commander" ? 99 : 60;
  const landsTarget =
    brewPrefs?.landsTarget && brewPrefs.landsTarget > 0
      ? brewPrefs.landsTarget
      : defaultLandsTargetFor(args.format);
  const spellTarget = spellTargetFor(args.format, landsTarget);
  const prefColors = sortWubrg(
    (args.colorPref ?? []).filter((c) => "WUBRG".includes(c)),
  );

  // Stage 1: commit to a strategic plan in a separate call. Skip for refine /
  // shore-up flows — they're already anchored to an existing deck.
  let planMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (extraMessages.length === 0) {
    const plan = await generatePlan(client, args, landsTarget);
    const planJson = JSON.stringify(plan, null, 2);
    onProgress?.({
      type: "status",
      message: `Plan: ${plan.archetype}${plan.commander ? ` — ${plan.commander}` : ""}. Building the list…`,
    });
    planMessages = [
      { role: "assistant", content: planJson },
      {
        role: "user",
        content: buildExecutionUserMessage(planJson, args.format, spellTarget),
      },
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

    // Strip any lands the AI snuck in, then size-gate against the spell
    // target. The AI's job is to fill exactly `spellTarget` non-land slots;
    // anything else gets retried.
    const owned = buildOwnedIndex(args.resolved);
    const isLandLine = (line: { name: string }): boolean => {
      const card = owned.get(nameKey(line.name))?.card;
      const tl = (card?.type_line ?? "").toLowerCase();
      return (
        tl.includes("land") ||
        ["plains", "island", "swamp", "mountain", "forest", "wastes"].includes(
          nameKey(line.name),
        )
      );
    };
    const stagedSpells = parsed.data.mainboard.filter((l) => !isLandLine(l));
    const aiLandsCount = parsed.data.mainboard
      .filter((l) => isLandLine(l))
      .reduce((s, l) => s + l.quantity, 0);
    const spellSum = stagedSpells.reduce((s, l) => s + l.quantity, 0);
    const sizeDelta = spellSum - spellTarget;
    if (sizeDelta !== 0) {
      const direction = sizeDelta < 0 ? "short" : "over";
      const abs = Math.abs(sizeDelta);
      const landsBlurb =
        aiLandsCount > 0
          ? ` (You also returned ${aiLandsCount} lands; lands are auto-built — do NOT include them. Pick non-land cards only.)`
          : "";
      lastErrors = [
        `Mainboard non-land quantity sum = ${spellSum}, but it MUST be exactly ${spellTarget} (you were ${abs} ${direction}).${landsBlurb} Add or remove non-land cards from the collection until the count is exactly ${spellTarget}.`,
      ];
      onProgress?.({
        type: "status",
        message: `Spell list was ${abs} ${direction} (${spellSum}/${spellTarget}) — asking the model to fix it…`,
      });
      continue;
    }

    // Append the auto mana base before trim so trim sees a full-sized deck.
    const commanderName = parsed.data.commander ?? null;
    const commanderCard = commanderName
      ? owned.get(nameKey(commanderName))?.card ?? null
      : null;
    const commanderColors = commanderCard?.color_identity ?? [];
    const manaBase = applyAutoManaBase(stagedSpells, owned, args.format, {
      landsTarget,
      commanderColors,
      prefColors,
    });
    const manaSummary: string[] = [];
    if (manaBase.staplesAdded.length) {
      manaSummary.push(
        `Auto mana base: included owned utility lands (${manaBase.staplesAdded.join(", ")}).`,
      );
    }
    const basicsParts = Object.entries(manaBase.basicsAdded)
      .filter(([, n]) => n > 0)
      .map(([c, n]) => `${n} ${c}`)
      .join(", ");
    if (basicsParts) {
      manaSummary.push(`Auto mana base: ${landsTarget} lands total, basics ${basicsParts}.`);
    }
    if (aiLandsCount > 0) {
      manaSummary.push(
        `Stripped ${aiLandsCount} land${aiLandsCount === 1 ? "" : "s"} the AI tried to include — mana base is auto-built.`,
      );
    }

    const rawDeck: BuiltDeck = {
      ...parsed.data,
      mainboard: manaBase.mainboard,
      format: args.format,
      warnings: parsed.data.warnings ?? [],
    };
    const { deck, adjustments } = applyTrim(rawDeck, args);
    deck.warnings = [...deck.warnings, ...manaSummary, ...adjustments];

    // Post-trim size gate: trim may have removed illegal/wrong-color cards.
    // If that drops us under target, the deck is unfit to ship — retry instead
    // of returning a short list with a warning slapped on it.
    const trimmedMainSize = deck.mainboard.reduce(
      (s, l) => s + l.quantity,
      0,
    );
    const commanderCount =
      args.format === "commander" && deck.commander ? 1 : 0;
    const targetTotal = totalMainSize + commanderCount;
    const finalTotal = trimmedMainSize + commanderCount;
    if (finalTotal !== targetTotal) {
      lastErrors = [
        `After trimming illegal or out-of-color cards, mainboard was ${trimmedMainSize}/${totalMainSize}` +
          (args.format === "commander" && !deck.commander
            ? " and no valid commander was set"
            : "") +
          `. Return a fresh non-land list of exactly ${spellTarget} cards using only legal collection cards that match the commander's color identity (lands are auto-added).`,
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
    ? ` Last attempt was ${lastTrimmedDeck.mainboard.reduce((s, l) => s + l.quantity, 0)}/${totalMainSize} mainboard cards${
        args.format === "commander" && lastTrimmedDeck.commander
          ? ` + ${lastTrimmedDeck.commander}`
          : ""
      }.`
    : "";
  throw new Error(
    `Couldn't build a complete ${args.format} deck after ${maxAttempts} attempts.${summary} The AI may be returning short lists for this collection — try widening colors, adding more cards, relaxing budget/ban filters, or simplifying the strategy brief.`,
  );
}
