import OpenAI from "openai";
import { z } from "zod";
import { collectionToPromptList } from "./collection";
import { formatRulesPrompt, getFormat, isBasicLand } from "./formats";
import { buildOwnedIndex, validateDeck } from "./deck-validation";
import type {
  BuiltDeck,
  FormatId,
  ResolvedCollectionCard,
  ScryfallCard,
} from "./types";
import {
  buildPreferencesPromptBlock,
  type DeckBuildPreferences,
} from "./deck-preferences";
import { getPowerPromptBlock } from "./power-levels";
import { trimDeckToCollection } from "./ai/trim";
import { getDisplayName, nameKey } from "./scryfall";

export { trimDeckToCollection } from "./ai/trim";

export type DeckBuildProgress =
  | { type: "status"; message: string }
  | { type: "token"; delta: string }
  | { type: "attempt"; attempt: number; maxAttempts: number };

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

const WUBRG = ["W", "U", "B", "R", "G"];

function sortWubrg(ci: string[]): string[] {
  return [...ci].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

function colorTag(ci: string[]): string {
  if (!ci.length) return "C";
  return sortWubrg(ci).join("");
}

function formatColorIdentity(ci: string[]): string {
  if (!ci.length) return "Colorless (C)";
  const sorted = sortWubrg(ci);
  return `${sorted.join("")} (${sorted.map((c) => COLOR_NAMES[c] ?? c).join("/")})`;
}

/** OpenAI often returns null for omitted optional fields; .optional() alone rejects that. */
const aiRequiredString = z
  .union([z.string(), z.null()])
  .refine((v): v is string => typeof v === "string" && v.trim().length > 0, {
    message: "expected non-empty string",
  });

const aiOptionalString = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));

const cardLineSchema = z.object({
  name: aiRequiredString,
  quantity: z.number().int().positive(),
  reason: aiOptionalString,
});

const stringList = z
  .array(z.union([z.string(), z.null()]))
  .optional()
  .transform((arr) =>
    arr?.filter((w): w is string => typeof w === "string" && w.trim().length > 0),
  );

const deckSchema = z.object({
  name: aiRequiredString,
  description: aiRequiredString,
  commander: z.union([z.string(), z.null()]),
  commanderReason: aiOptionalString,
  archetype: aiOptionalString,
  overview: aiOptionalString,
  winConditions: stringList,
  strengths: stringList,
  weaknesses: stringList,
  mainboard: z.array(cardLineSchema),
  sideboard: z.array(cardLineSchema),
  strategy: aiRequiredString,
  warnings: stringList,
});

type PromptCard = {
  name: string;
  quantity: number;
  typeLine: string;
  identity: string[];
  card: ScryfallCard;
};

function gatherPromptCards(
  resolved: ResolvedCollectionCard[],
  format: FormatId,
): PromptCard[] {
  // De-dupe by Scryfall card id (different printings of the same card share an id).
  const owned = buildOwnedIndex(resolved);
  const seen = new Set<string>();
  const formatRules = getFormat(format);
  const out: PromptCard[] = [];
  for (const entry of owned.values()) {
    if (seen.has(entry.card.id)) continue;
    seen.add(entry.card.id);
    const name = getDisplayName(entry.card);
    const formatMax = isBasicLand(name) ? 99 : formatRules.maxCopies(entry.card);
    out.push({
      name,
      quantity: Math.min(entry.qty, formatMax),
      typeLine: entry.card.type_line,
      identity: sortWubrg(entry.card.color_identity ?? []),
      card: entry.card,
    });
  }
  return out;
}

function buildCollectionContext(
  resolved: ResolvedCollectionCard[],
  format: FormatId,
  prefColors: string[] = [],
): string {
  const cards = gatherPromptCards(resolved, format);
  const filtered =
    prefColors.length > 0
      ? cards.filter((c) => c.identity.every((x) => prefColors.includes(x)))
      : cards;

  if (prefColors.length >= 2) {
    const multi = filtered.filter((c) => c.identity.length >= 2);
    const mono = filtered.filter((c) => c.identity.length === 1);
    const colorless = filtered.filter((c) => c.identity.length === 0);
    const lines: string[] = [];

    if (multi.length) {
      lines.push(
        `=== MULTICOLOR SIGNATURE CARDS (${multi.length}) — HIGH PRIORITY, prefer these heavily; they pay off your color commitment ===`,
      );
      lines.push(
        collectionToPromptList(
          multi.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            typeLine: c.typeLine,
            colors: [colorTag(c.identity)],
          })),
        ),
      );
    }
    if (mono.length) {
      lines.push(`\n=== MONO-COLOR CARDS (${mono.length}) ===`);
      lines.push(
        collectionToPromptList(
          mono.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            typeLine: c.typeLine,
            colors: [colorTag(c.identity)],
          })),
        ),
      );
    }
    if (colorless.length) {
      lines.push(`\n=== COLORLESS / ARTIFACTS (${colorless.length}) ===`);
      lines.push(
        collectionToPromptList(
          colorless.map((c) => ({
            name: c.name,
            quantity: c.quantity,
            typeLine: c.typeLine,
            colors: ["C"],
          })),
        ),
      );
    }
    return lines.join("\n");
  }

  return collectionToPromptList(
    filtered.map((c) => ({
      name: c.name,
      quantity: c.quantity,
      typeLine: c.typeLine,
      colors: [colorTag(c.identity)],
    })),
  );
}

function systemPrompt(format: FormatId): string {
  const singletonReminder =
    format === "commander"
      ? `\n- COMMANDER SINGLETON: Every non-basic card may appear AT MOST 1 time in the entire deck. The collection list shows each non-basic as "1x" for this reason. Do NOT use 2x, 3x, or 4x of any non-basic card. The ONLY cards you may repeat are basic lands (Plains, Island, Swamp, Mountain, Forest, Wastes).
- USE THE FULL COMMANDER COLOR IDENTITY: If the commander is multicolor, the deck MUST contain meaningful cards from EVERY color in its identity, plus a mana base that produces every color. Do not silently collapse a 2-color commander into a mono-color deck. The user picked multicolor for a reason — honor it.`
      : "";

  return `You are an expert Magic: The Gathering deck architect.

You build COMPLETE, playable, competitive-leaning decks using ONLY cards from the user's collection list.

ABSOLUTE RULES — violating any of these will cause the deck to be auto-trimmed and look bad to the user:
- Use ONLY cards whose exact names appear in the collection list below.
- The collection lists each card prefixed with "Nx" — that is the MAXIMUM number of copies of that card you may use across mainboard + sideboard + commander combined. Never exceed it.
- If you need more of a card than the user owns, pick a DIFFERENT card from the collection instead of asking for more copies.
- Never invent, hallucinate, or guess at cards. If a card you want isn't listed, don't include it.
- The sum of all mainboard quantities MUST equal the exact mainboard size for the format. Count carefully before responding. Do not overshoot or undershoot by even one card.
- For Commander, the mainboard is EXACTLY 99 cards (the commander is separate). For Standard/Modern, the mainboard is EXACTLY 60 cards.${singletonReminder}

${formatRulesPrompt(format)}

Design principles:
- Include a coherent game plan (aggro, control, midrange, combo, etc.)
- Respect mana curve: enough lands, early plays, meaningful top-end where appropriate
- Include removal, card draw, or interaction where the format expects it
- For Commander: pick the best commander from the collection for the available card pool; explain the synergy
- For 60-card formats: target exactly 60 mainboard cards; sideboard 0-15 if useful
- Use exact English card names as they appear on Scryfall
- For ANY multi-color deck (whether by commander or user-requested combo), PRIORITIZE multicolor cards (gold cards, hybrid cards) over mono-color staples. Multicolor cards justify the color commitment and are the signature payoffs of running multiple colors — they should make up a meaningful fraction of every multi-color deck, not be afterthoughts.

For EVERY card you include (mainboard, sideboard, and commander) give a short "reason" (one sentence, 8-20 words) explaining why it earns its slot in THIS deck — its role, synergy, or matchup it answers. Be specific to the deck's plan, not generic.

Respond with JSON only matching this schema:
{
  "name": "deck name (evocative, 2-5 words)",
  "description": "one-sentence hook describing the deck's vibe",
  "archetype": "Aggro | Midrange | Control | Combo | Tempo | Tribal | Ramp | Voltron | Tokens | Stax | Reanimator | Etc.",
  "overview": "2-3 sentence paragraph: what the deck does, how it wins, and what makes it fun or powerful. Written for the deck owner, not generic.",
  "winConditions": ["concrete way 1 the deck wins", "concrete way 2", "concrete way 3"],
  "strengths": ["specific strength 1 (3-8 words)", "specific strength 2", "specific strength 3"],
  "weaknesses": ["honest matchup or vulnerability 1", "vulnerability 2", "vulnerability 3"],
  "commander": "Card Name or null",
  "commanderReason": "why this commander, or null",
  "mainboard": [{ "name": "Exact Card Name", "quantity": 4, "reason": "Cheap removal that swings tempo." }],
  "sideboard": [{ "name": "Exact Card Name", "quantity": 2, "reason": "Comes in vs aggro for early blockers." }],
  "strategy": "how to pilot the deck turn-by-turn: opening hand priorities, mulligan rules, mid-game plan, finishing sequence. 4-8 sentences.",
  "warnings": ["optional notes about missing pieces"]
}`;
}

function buildColorInventory(resolved: ResolvedCollectionCard[]): string {
  const counts = new Map<string, number>();
  for (const r of resolved) {
    if (!r.card) continue;
    const key = colorTag(r.card.color_identity ?? []);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return rows.map(([k, n]) => `  [${k}] ${n} unique cards`).join("\n");
}

function buildBaseUserMessage(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  brewPrefs?: DeckBuildPreferences,
): string {
  const prefColors = sortWubrg(
    (colorPref ?? []).filter((c) => "WUBRG".includes(c)),
  );
  const collectionContext = buildCollectionContext(resolved, format, prefColors);
  const unresolved = resolved.filter((r) => !r.card).map((r) => r.entry.name);

  const limitNote =
    format === "commander"
      ? `Each non-basic card below shows as 1x — that is the SINGLETON limit for Commander. Use AT MOST 1 copy of each. Only basic lands may repeat.

Each card lists its color identity in brackets, e.g. (Creature [UB]) means Blue+Black. Colorless cards show [C].

STEP 1: PICK THE COMMANDER FIRST. Pick a legendary creature whose color identity gives you the deepest, most cohesive card pool from the inventory below.

STEP 2: USE EVERY COLOR IN THE COMMANDER'S IDENTITY. If the commander is 2-color (e.g. [GW]) the deck MUST meaningfully use BOTH Green and White cards — not just one. If it's 3-color, use all three. A multicolor commander piloting a mono-color deck is a FAILED build.

STEP 3: COLOR LEGALITY. Every card's bracket letters must be a SUBSET of the commander's letters. A card with [U] in a [GW] deck is ILLEGAL.

STEP 4: BALANCE THE MANA BASE. For a 2-color commander, the lands and ramp should produce both colors. Include multicolor lands and dual lands you own. Split basics roughly evenly across the commander's colors unless the strategy demands otherwise.

COLOR INVENTORY (unique cards you own by color identity):
${buildColorInventory(resolved)}`
      : "Each card below shows the max copies you can use (capped at the format's 4-of rule). Never exceed those numbers.";

  let userMessage = `Build a ${format} deck from this collection.\n\n${limitNote}\n\nCOLLECTION:\n${collectionContext}`;

  if (prefColors.length) {
    const colorList = formatColorIdentity(prefColors);
    const tag = prefColors.join("");
    const multicolorEmphasis =
      prefColors.length >= 2
        ? `

*** MULTICOLOR PICKS ARE THE HEART OF THIS DECK ***
- The collection list shows a "MULTICOLOR SIGNATURE CARDS" section first — these cards use TWO OR MORE of your requested colors at once and are usually the strongest, most synergistic picks in a ${tag} deck.
- A well-built ${tag} deck is NOT a 50/50 split of mono-color cards. It leans HEAVILY on multicolor cards that justify the color commitment (gold cards, hybrid cards, multicolor dual lands).
- Aim for AT LEAST 8-15 multicolor cards in a 2-color Commander deck (more if more colors). For 60-card formats, include every playable multicolor signature card you own.
- If a multicolor card and a mono-color card are roughly equivalent in role, pick the multicolor card — it signals the deck's identity.`
        : "";
    const prefBlock =
      format === "commander"
        ? `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors for the deck: ${colorList}.
- The commander's color identity MUST be EXACTLY ${tag} (every requested color, no extras, no fewer).
- Every other card's color identity must be a SUBSET of {${prefColors.join(", ")}}.
- The mana base must produce all ${prefColors.length} requested color${prefColors.length === 1 ? "" : "s"}.
- Cards outside these colors are not even shown in the collection list below. Use only what's listed.${multicolorEmphasis}`
        : `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors: ${colorList}.
- Every card you include must have a color identity that is a SUBSET of {${prefColors.join(", ")}}.
- The mana base must reliably produce all ${prefColors.length} requested color${prefColors.length === 1 ? "" : "s"}.
- Cards outside these colors are not even shown in the collection list below.${multicolorEmphasis}`;
    userMessage += prefBlock;
  }

  if (maxBudgetUsd && maxBudgetUsd > 0) {
    userMessage += `\n\n*** BUDGET CAP — $${maxBudgetUsd} USD per card (Scryfall nonfoil) ***
- Do not include any card whose typical price exceeds $${maxBudgetUsd}.
- Prefer budget-friendly alternatives from the collection. Basic lands are always allowed.`;
  }

  const powerBlock = getPowerPromptBlock(brewPrefs?.powerLevel);
  if (powerBlock) {
    userMessage += `\n\n${powerBlock}`;
  }

  const prefsBlock = buildPreferencesPromptBlock(format, brewPrefs ?? {});
  if (prefsBlock) {
    userMessage += `\n\n${prefsBlock}`;
  }

  if (strategyHint?.trim()) {
    userMessage += `\n\nUser preference: ${strategyHint.trim()}`;
  }
  if (unresolved.length) {
    userMessage += `\n\nNote: these collection lines could not be resolved on Scryfall — do NOT use them: ${unresolved.join(", ")}`;
  }
  return userMessage;
}

async function runDeckGeneration(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  baseMessages: OpenAI.Chat.ChatCompletionMessageParam[],
  maxAttempts: number,
  colorPref?: string[],
  maxBudgetUsd?: number,
  onProgress?: (event: DeckBuildProgress) => void,
  brewPrefs?: DeckBuildPreferences,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local to enable AI deck building.",
    );
  }

  const client = new OpenAI({ apiKey });
  let lastErrors: string[] = [];
  let parsedDeck: z.infer<typeof deckSchema> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [...baseMessages];

    if (attempt > 0 && lastErrors.length) {
      messages.push({
        role: "user",
        content: `Your previous list failed validation. Fix ALL issues and return corrected JSON only:\n${lastErrors.map((e) => `- ${e}`).join("\n")}`,
      });
    }

    onProgress?.({
      type: "attempt",
      attempt: attempt + 1,
      maxAttempts,
    });
    onProgress?.({
      type: "status",
      message:
        attempt === 0
          ? "Reading your collection and drafting a deck list…"
          : `Fixing ${lastErrors.length} validation issue${lastErrors.length === 1 ? "" : "s"}…`,
    });

    let raw = "";
    if (onProgress) {
      const stream = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
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
    } else {
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages,
      });
      raw = completion.choices[0]?.message?.content ?? "";
    }

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

    const rawDeck: BuiltDeck = {
      ...parsed.data,
      format,
      warnings: parsed.data.warnings ?? [],
    };

    const { deck, adjustments } = trimDeckToCollection(
      rawDeck,
      resolved,
      colorPref,
      maxBudgetUsd,
      brewPrefs,
    );
    if (adjustments.length) {
      deck.warnings = [...deck.warnings, ...adjustments];
    }

    const validation = validateDeck(deck, resolved);
    if (validation.valid) {
      onProgress?.({ type: "status", message: "Deck validated — ready!" });
      return { deck, validationErrors: [] };
    }

    lastErrors = validation.errors;
  }

  if (!parsedDeck) {
    throw new Error(`Deck generation failed: ${lastErrors.join("; ")}`);
  }

  const rawDeck: BuiltDeck = {
    ...parsedDeck,
    format,
    warnings: parsedDeck.warnings ?? [],
  };
  const { deck, adjustments } = trimDeckToCollection(
    rawDeck,
    resolved,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );
  deck.warnings = [...deck.warnings, ...adjustments, ...lastErrors];

  return { deck, validationErrors: lastErrors };
}

export async function buildDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  onProgress?: (event: DeckBuildProgress) => void,
  brewPrefs?: DeckBuildPreferences,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(
    format,
    resolved,
    strategyHint,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );
  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
  ];
  return runDeckGeneration(
    format,
    resolved,
    baseMessages,
    3,
    colorPref,
    maxBudgetUsd,
    onProgress,
    brewPrefs,
  );
}

export async function shoreUpDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  previousDeck: BuiltDeck,
  weaknesses: string[],
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  onProgress?: (event: DeckBuildProgress) => void,
  brewPrefs?: DeckBuildPreferences,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(
    format,
    resolved,
    strategyHint,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );
  const previousJson = JSON.stringify(
    {
      name: previousDeck.name,
      description: previousDeck.description,
      archetype: previousDeck.archetype,
      overview: previousDeck.overview,
      winConditions: previousDeck.winConditions,
      strengths: previousDeck.strengths,
      weaknesses: previousDeck.weaknesses,
      commander: previousDeck.commander,
      commanderReason: previousDeck.commanderReason,
      mainboard: previousDeck.mainboard,
      sideboard: previousDeck.sideboard,
      strategy: previousDeck.strategy,
    },
    null,
    2,
  );

  const weaknessList = weaknesses
    .map((w, i) => `${i + 1}. ${w}`)
    .join("\n");

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
    { role: "assistant", content: previousJson },
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

  return runDeckGeneration(
    format,
    resolved,
    baseMessages,
    3,
    colorPref,
    maxBudgetUsd,
    onProgress,
    brewPrefs,
  );
}

export async function refineDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  previousDeck: BuiltDeck,
  errors: string[],
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  onProgress?: (event: DeckBuildProgress) => void,
  brewPrefs?: DeckBuildPreferences,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(
    format,
    resolved,
    strategyHint,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );
  const previousJson = JSON.stringify(
    {
      name: previousDeck.name,
      description: previousDeck.description,
      archetype: previousDeck.archetype,
      overview: previousDeck.overview,
      winConditions: previousDeck.winConditions,
      strengths: previousDeck.strengths,
      weaknesses: previousDeck.weaknesses,
      commander: previousDeck.commander,
      commanderReason: previousDeck.commanderReason,
      mainboard: previousDeck.mainboard,
      sideboard: previousDeck.sideboard,
      strategy: previousDeck.strategy,
    },
    null,
    2,
  );

  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
    { role: "assistant", content: previousJson },
    {
      role: "user",
      content: `That deck has these problems — fix EVERY one and return corrected JSON only:\n${errors
        .map((e) => `- ${e}`)
        .join(
          "\n",
        )}\n\nKeep the same overall game plan and as many of the existing card choices as possible. Only change what is necessary to satisfy the rules and quantities.`,
    },
  ];

  return runDeckGeneration(
    format,
    resolved,
    baseMessages,
    4,
    colorPref,
    maxBudgetUsd,
    onProgress,
    brewPrefs,
  );
}

const swapResponseSchema = z.object({
  replacements: z.array(
    z.object({
      name: aiRequiredString,
      quantity: z.number().int().positive(),
      reason: aiOptionalString,
    }),
  ),
});

export async function swapCardWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  deck: BuiltDeck,
  cardToReplace: string,
  zone: "mainboard" | "sideboard" | "commander",
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  brewPrefs?: DeckBuildPreferences,
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const userMessage = buildBaseUserMessage(
    format,
    resolved,
    strategyHint,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );

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

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt(format) },
      { role: "user", content: userMessage },
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
  if (!parsed.success) {
    throw new Error("AI swap response was invalid");
  }

  const updated: BuiltDeck = { ...deck, warnings: [...deck.warnings] };
  const removeKey = nameKey(cardToReplace);

  if (zone === "commander") {
    const rep = parsed.data.replacements[0];
    if (!rep) throw new Error("No replacement commander suggested");
    updated.commander = rep.name;
    updated.commanderReason = rep.reason;
  } else {
    const list = zone === "mainboard" ? updated.mainboard : updated.sideboard;
    const filtered = list.filter((l) => nameKey(l.name) !== removeKey);
    const merged = [...filtered, ...parsed.data.replacements];
    if (zone === "mainboard") updated.mainboard = merged;
    else updated.sideboard = merged;
  }

  const { deck: trimmed, adjustments } = trimDeckToCollection(
    updated,
    resolved,
    colorPref,
    maxBudgetUsd,
    brewPrefs,
  );
  trimmed.warnings = [
    ...trimmed.warnings,
    ...adjustments,
    `Swapped out ${cardToReplace} for ${parsed.data.replacements.map((r) => r.name).join(", ")}.`,
  ];

  const validation = validateDeck(trimmed, resolved);
  return {
    deck: trimmed,
    validationErrors: validation.valid ? [] : validation.errors,
  };
}
