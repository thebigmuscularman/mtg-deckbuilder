import OpenAI from "openai";
import { validateDeck } from "../deck-validation";
import type { BuiltDeck } from "../types";
import { buildBaseUserMessage, systemPrompt } from "./prompts";
import { swapResponseSchema } from "./deck-schema";
import { trimDeckToCollection } from "./trim";
import { nameKey } from "../scryfall";
import { requireOpenAIKey, runDeckGeneration } from "./generation";
import type { BrewArgs, DeckResult } from "./types";

function serializePreviousDeck(deck: BuiltDeck): string {
  return JSON.stringify(
    {
      name: deck.name,
      description: deck.description,
      archetype: deck.archetype,
      overview: deck.overview,
      winConditions: deck.winConditions,
      strengths: deck.strengths,
      weaknesses: deck.weaknesses,
      commander: deck.commander,
      commanderReason: deck.commanderReason,
      mainboard: deck.mainboard,
      sideboard: deck.sideboard,
      strategy: deck.strategy,
    },
    null,
    2,
  );
}

function baseMessages(
  args: BrewArgs,
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    { role: "system", content: systemPrompt(args.format) },
    {
      role: "user",
      content: buildBaseUserMessage(
        args.format,
        args.resolved,
        args.strategyHint,
        args.colorPref,
        args.maxBudgetUsd,
        args.brewPrefs,
      ),
    },
  ];
}

export function buildDeckWithAI(args: BrewArgs): Promise<DeckResult> {
  return runDeckGeneration(args, baseMessages(args), 3);
}

export function shoreUpDeckWithAI(
  args: BrewArgs & { previousDeck: BuiltDeck; weaknesses: string[] },
): Promise<DeckResult> {
  const weaknessList = args.weaknesses
    .map((w, i) => `${i + 1}. ${w}`)
    .join("\n");
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...baseMessages(args),
    { role: "assistant", content: serializePreviousDeck(args.previousDeck) },
    {
      role: "user",
      content: `The deck above has these self-identified WEAKNESSES:
${weaknessList}

Revise the deck to SHORE UP each weakness using cards from the collection — swap in answers, hate pieces, alternative win conditions, or curve adjustments that mitigate the specific vulnerabilities listed.

Hard constraints:
- This is a strategic upgrade, NOT a rebuild. Keep the commander, archetype, game plan, and the bulk of the mainboard intact.
- Swap out the LOWEST-impact cards (filler creatures, redundant utility, overlapping effects) for targeted answers to each weakness. Aim to change 4-10 slots in a 60-card deck, 6-12 in a Commander deck.
- Every replacement must come from the collection list and obey the same format / quantity / color-identity rules as before.
- Update the "weaknesses" array in your response to reflect the new (smaller) list of vulnerabilities after your changes — if a weakness is fully addressed, remove it; otherwise rewrite it to reflect what's left.
- Update "strengths" if your changes meaningfully reinforce them.
- Return the FULL deck JSON, not a diff.`,
    },
  ];
  return runDeckGeneration(args, messages, 3);
}

export function refineDeckWithAI(
  args: BrewArgs & { previousDeck: BuiltDeck; errors: string[] },
): Promise<DeckResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    ...baseMessages(args),
    { role: "assistant", content: serializePreviousDeck(args.previousDeck) },
    {
      role: "user",
      content: `That deck has these problems — fix EVERY one and return corrected JSON only:\n${args.errors
        .map((e) => `- ${e}`)
        .join(
          "\n",
        )}\n\nKeep the same overall game plan and as many of the existing card choices as possible. Only change what is necessary to satisfy the rules and quantities.`,
    },
  ];
  return runDeckGeneration(args, messages, 4);
}

export async function swapCardWithAI(
  args: BrewArgs & {
    previousDeck: BuiltDeck;
    cardToReplace: string;
    zone: "mainboard" | "sideboard" | "commander";
  },
): Promise<DeckResult> {
  const { previousDeck: deck, cardToReplace, zone } = args;
  const deckJson = JSON.stringify(
    {
      name: deck.name,
      commander: deck.commander,
      mainboard: deck.mainboard,
      sideboard: deck.sideboard,
      strategy: deck.strategy,
    },
    null,
    2,
  );

  const client = new OpenAI({ apiKey: requireOpenAIKey() });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      ...baseMessages(args),
      { role: "assistant", content: deckJson },
      {
        role: "user",
        content: `Replace "${cardToReplace}" in the ${zone} with a BETTER alternative from the collection for this deck's plan.
Return JSON only:
{
  "replacements": [{ "name": "Exact Card Name", "quantity": 1, "reason": "why this swap improves the deck" }]
}
- Use only cards from the collection. Same quantity rules as the format.
- Do NOT include "${cardToReplace}" in replacements.
- If ${zone} is commander, replacements must be a single legendary commander you own.`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("AI returned an empty response");

  const parsed = swapResponseSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new Error("AI swap response was invalid");

  const updated: BuiltDeck = { ...deck, warnings: [...deck.warnings] };
  const removeKey = nameKey(cardToReplace);

  if (zone === "commander") {
    const rep = parsed.data.replacements[0];
    if (!rep) throw new Error("No replacement commander suggested");
    updated.commander = rep.name;
    updated.commanderReason = rep.reason;
  } else {
    const list = zone === "mainboard" ? updated.mainboard : updated.sideboard;
    const merged = [
      ...list.filter((l) => nameKey(l.name) !== removeKey),
      ...parsed.data.replacements,
    ];
    if (zone === "mainboard") updated.mainboard = merged;
    else updated.sideboard = merged;
  }

  const { deck: trimmed, adjustments } = trimDeckToCollection(
    updated,
    args.resolved,
    args.colorPref,
    args.maxBudgetUsd,
    args.brewPrefs,
  );
  trimmed.warnings = [
    ...trimmed.warnings,
    ...adjustments,
    `Swapped out ${cardToReplace} for ${parsed.data.replacements.map((r) => r.name).join(", ")}.`,
  ];

  const validation = validateDeck(trimmed, args.resolved, {
    allowIllegal: args.brewPrefs?.allowIllegal,
  });
  return {
    deck: trimmed,
    validationErrors: validation.valid ? [] : validation.errors,
  };
}
