import OpenAI from "openai";
import { z } from "zod";
import { collectionToPromptList } from "./collection";
import {
  cardMeetsColorIdentity,
  formatRulesPrompt,
  getFormat,
  isBasicLand,
} from "./formats";
import { validateDeck } from "./deck-validation";
import type {
  BuiltDeck,
  DeckCardLine,
  FormatId,
  ResolvedCollectionCard,
  ScryfallCard,
} from "./types";
import { getDisplayName } from "./scryfall";

const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

function formatColorIdentity(ci: string[]): string {
  if (!ci.length) return "Colorless (C)";
  const order = ["W", "U", "B", "R", "G"];
  const sorted = [...ci].sort((a, b) => order.indexOf(a) - order.indexOf(b));
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

function buildCollectionContext(
  resolved: ResolvedCollectionCard[],
  format: FormatId,
): string {
  const totals = new Map<string, { qty: number; card: ScryfallCard }>();
  for (const r of resolved) {
    if (!r.card) continue;
    const name = getDisplayName(r.card);
    const key = name.toLowerCase();
    const existing = totals.get(key);
    if (existing) {
      existing.qty += r.entry.quantity;
    } else {
      totals.set(key, { qty: r.entry.quantity, card: r.card });
    }
  }

  const formatRules = getFormat(format);
  const playable = [...totals.values()].map(({ qty, card }) => {
    const name = getDisplayName(card);
    const formatMax = isBasicLand(name) ? 99 : formatRules.maxCopies(card);
    const ci = card.color_identity ?? [];
    const ciTag = ci.length ? ci.join("") : "C";
    return {
      name,
      quantity: Math.min(qty, formatMax),
      typeLine: card.type_line,
      colors: [ciTag],
    };
  });

  return collectionToPromptList(playable);
}

function buildOwnedQuantities(
  resolved: ResolvedCollectionCard[],
): Map<string, { qty: number; card: ScryfallCard }> {
  const totals = new Map<string, { qty: number; card: ScryfallCard }>();
  for (const r of resolved) {
    if (!r.card) continue;
    const key = getDisplayName(r.card).toLowerCase();
    const existing = totals.get(key);
    if (existing) {
      existing.qty += r.entry.quantity;
    } else {
      totals.set(key, { qty: r.entry.quantity, card: r.card });
    }
  }
  return totals;
}

/**
 * Hard guarantee: the deck shown to the user never references cards the user
 * doesn't own or quantities they don't have. Drops unknowns and clamps to
 * min(owned, format max). Returns a list of human-readable adjustments.
 */
function trimDeckToCollection(
  deck: BuiltDeck,
  resolved: ResolvedCollectionCard[],
  colorPref?: string[],
): { deck: BuiltDeck; adjustments: string[] } {
  const formatRules = getFormat(deck.format);
  const owned = buildOwnedQuantities(resolved);
  const adjustments: string[] = [];
  const prefColors = (colorPref ?? []).filter((c) => "WUBRG".includes(c));

  const clampLines = (lines: DeckCardLine[], zone: "mainboard" | "sideboard") => {
    const merged = new Map<string, DeckCardLine>();
    for (const line of lines) {
      const key = line.name.trim().toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += line.quantity;
        if (!existing.reason && line.reason) existing.reason = line.reason;
      } else {
        merged.set(key, { ...line, name: line.name.trim() });
      }
    }

    const out: DeckCardLine[] = [];
    for (const line of merged.values()) {
      const key = line.name.toLowerCase();
      const ownedEntry = owned.get(key);

      if (!ownedEntry) {
        adjustments.push(`Dropped ${zone} card not in collection: ${line.name}`);
        continue;
      }

      const display = getDisplayName(ownedEntry.card);
      const formatMax = isBasicLand(display)
        ? 99
        : formatRules.maxCopies(ownedEntry.card);
      const allowed = Math.min(ownedEntry.qty, formatMax);

      if (allowed <= 0) {
        adjustments.push(`Dropped ${display} (no copies available).`);
        continue;
      }

      if (line.quantity > allowed) {
        adjustments.push(
          `Trimmed ${display} from ${line.quantity} to ${allowed} (owned ${ownedEntry.qty}, format max ${formatMax}).`,
        );
      }

      out.push({
        name: display,
        quantity: Math.min(line.quantity, allowed),
        reason: line.reason,
        scryfallId: ownedEntry.card.id,
      });
    }

    return out;
  };

  let commander = deck.commander;
  let commanderReason = deck.commanderReason;
  let commanderCard: ScryfallCard | null = null;
  if (commander) {
    const key = commander.trim().toLowerCase();
    const ownedEntry = owned.get(key);
    if (!ownedEntry) {
      adjustments.push(
        `Dropped commander not in collection: ${commander}. Choose a legendary creature you own.`,
      );
      commander = null;
      commanderReason = undefined;
    } else {
      commander = getDisplayName(ownedEntry.card);
      commanderCard = ownedEntry.card;
    }
  }

  let trimmedMainboard = clampLines(deck.mainboard, "mainboard");
  let trimmedSideboard = clampLines(deck.sideboard, "sideboard");

  // Hard filter against the user's color preference (applies to all formats).
  if (prefColors.length) {
    const filterByPref = (lines: DeckCardLine[], zone: string) => {
      const kept: DeckCardLine[] = [];
      for (const line of lines) {
        const ownedEntry = owned.get(line.name.toLowerCase());
        if (!ownedEntry) {
          kept.push(line);
          continue;
        }
        if (cardMeetsColorIdentity(ownedEntry.card, prefColors)) {
          kept.push(line);
        } else {
          adjustments.push(
            `Dropped ${getDisplayName(ownedEntry.card)} from ${zone} — outside requested colors ${formatColorIdentity(prefColors)}.`,
          );
        }
      }
      return kept;
    };
    trimmedMainboard = filterByPref(trimmedMainboard, "mainboard");
    trimmedSideboard = filterByPref(trimmedSideboard, "sideboard");

    if (commanderCard && !cardMeetsColorIdentity(commanderCard, prefColors)) {
      adjustments.push(
        `Dropped commander ${commander} — color identity outside requested ${formatColorIdentity(prefColors)}. Pick a legendary creature whose identity fits.`,
      );
      commander = null;
      commanderReason = undefined;
      commanderCard = null;
    }
  }

  // Hard filter color identity violations for Commander.
  if (deck.format === "commander" && commanderCard) {
    const commanderColors = commanderCard.color_identity ?? [];
    const filterByColor = (lines: DeckCardLine[], zone: string) => {
      const kept: DeckCardLine[] = [];
      for (const line of lines) {
        const ownedEntry = owned.get(line.name.toLowerCase());
        if (!ownedEntry) {
          kept.push(line);
          continue;
        }
        if (cardMeetsColorIdentity(ownedEntry.card, commanderColors)) {
          kept.push(line);
        } else {
          adjustments.push(
            `Dropped ${getDisplayName(ownedEntry.card)} from ${zone} — outside commander color identity ${formatColorIdentity(commanderColors)}.`,
          );
        }
      }
      return kept;
    };
    trimmedMainboard = filterByColor(trimmedMainboard, "mainboard");
    trimmedSideboard = filterByColor(trimmedSideboard, "sideboard");

    // Flag if the deck only uses some of the commander's colors.
    if (commanderColors.length >= 2) {
      const used = new Set<string>();
      for (const line of trimmedMainboard) {
        const card = owned.get(line.name.toLowerCase())?.card;
        if (!card) continue;
        for (const c of card.color_identity ?? []) used.add(c);
      }
      const missing = commanderColors.filter((c) => !used.has(c));
      if (missing.length) {
        adjustments.push(
          `Deck under-uses the commander's color identity — missing meaningful ${missing
            .map((c) => COLOR_NAMES[c] ?? c)
            .join(" / ")} cards. Click "Fix errors with AI" to rebalance.`,
        );
      }
    }
  }

  const sumQty = (lines: DeckCardLine[]) =>
    lines.reduce((s, l) => s + l.quantity, 0);

  const targetMain =
    deck.format === "commander" ? 99 : formatRules.minMainboard;
  const maxSide = formatRules.maxSideboard;

  // Mainboard: chop excess copies (prefer trimming highest-count non-basic slots first).
  let mainCount = sumQty(trimmedMainboard);
  if (mainCount > targetMain) {
    const sorted = [...trimmedMainboard]
      .map((line, idx) => ({ line, idx }))
      .sort((a, b) => {
        const ba = isBasicLand(a.line.name);
        const bb = isBasicLand(b.line.name);
        if (ba !== bb) return ba ? 1 : -1;
        return b.line.quantity - a.line.quantity;
      });
    let excess = mainCount - targetMain;
    for (const { idx } of sorted) {
      if (excess <= 0) break;
      const take = Math.min(excess, trimmedMainboard[idx].quantity);
      trimmedMainboard[idx].quantity -= take;
      excess -= take;
    }
    trimmedMainboard = trimmedMainboard.filter((l) => l.quantity > 0);
    adjustments.push(
      `Mainboard had too many cards; removed ${mainCount - targetMain} copies to reach ${targetMain}.`,
    );
    mainCount = sumQty(trimmedMainboard);
  }

  // Mainboard: backfill with available basics if undersized.
  if (mainCount < targetMain) {
    const need = targetMain - mainCount;
    const basics = [...owned.values()]
      .filter(({ card }) => isBasicLand(getDisplayName(card)))
      .sort((a, b) => b.qty - a.qty);
    let remaining = need;
    for (const basic of basics) {
      if (remaining <= 0) break;
      const display = getDisplayName(basic.card);
      const existing = trimmedMainboard.find(
        (l) => l.name.toLowerCase() === display.toLowerCase(),
      );
      const used = existing?.quantity ?? 0;
      const headroom = basic.qty - used;
      if (headroom <= 0) continue;
      const add = Math.min(headroom, remaining);
      if (existing) {
        existing.quantity += add;
      } else {
        trimmedMainboard.push({
          name: display,
          quantity: add,
          reason: "Mana fixer added to meet the deck size requirement.",
          scryfallId: basic.card.id,
        });
      }
      remaining -= add;
    }
    if (remaining > 0) {
      adjustments.push(
        `Mainboard is ${remaining} card${remaining === 1 ? "" : "s"} short of ${targetMain}; not enough owned lands to fill.`,
      );
    } else if (need > 0) {
      adjustments.push(
        `Mainboard was ${need} card${need === 1 ? "" : "s"} short; filled with owned basic lands.`,
      );
    }
  }

  // Sideboard: enforce max.
  if (deck.format === "commander") {
    if (trimmedSideboard.length) {
      adjustments.push("Commander format has no sideboard; removed sideboard cards.");
    }
    trimmedSideboard = [];
  } else if (sumQty(trimmedSideboard) > maxSide) {
    const sortedSb = [...trimmedSideboard]
      .map((line, idx) => ({ line, idx }))
      .sort((a, b) => b.line.quantity - a.line.quantity);
    let excessSb = sumQty(trimmedSideboard) - maxSide;
    for (const { idx } of sortedSb) {
      if (excessSb <= 0) break;
      const take = Math.min(excessSb, trimmedSideboard[idx].quantity);
      trimmedSideboard[idx].quantity -= take;
      excessSb -= take;
    }
    trimmedSideboard = trimmedSideboard.filter((l) => l.quantity > 0);
    adjustments.push(`Sideboard trimmed to the ${maxSide}-card max.`);
  }

  return {
    deck: {
      ...deck,
      commander,
      commanderReason,
      mainboard: trimmedMainboard,
      sideboard: trimmedSideboard,
    },
    adjustments,
  };
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
    const ci = r.card.color_identity ?? [];
    const key = ci.length ? [...ci].sort().join("") : "C";
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
): string {
  const collectionContext = buildCollectionContext(resolved, format);
  const unresolved = resolved.filter((r) => !r.card).map((r) => r.entry.name);
  const prefColors = (colorPref ?? []).filter((c) => "WUBRG".includes(c));

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
    const sorted = [...prefColors].sort(
      (a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b),
    );
    const prefBlock =
      format === "commander"
        ? `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors for the deck: ${colorList}.
- The commander's color identity MUST be EXACTLY ${sorted.join("")} (every requested color, no extras, no fewer).
- Every other card's color identity must be a SUBSET of {${sorted.join(", ")}}.
- Cards outside these colors are ILLEGAL and will be removed. Pick again rather than including them.
- The mana base must produce all ${sorted.length} requested color${sorted.length === 1 ? "" : "s"}.`
        : `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors: ${colorList}.
- Every card you include must have a color identity that is a SUBSET of {${sorted.join(", ")}}.
- Do not include cards with any other color. Pick alternatives from the collection instead.
- The mana base must reliably produce all ${sorted.length} requested color${sorted.length === 1 ? "" : "s"}.`;
    userMessage += prefBlock;
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

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages,
    });

    const raw = completion.choices[0]?.message?.content;
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

    const { deck, adjustments } = trimDeckToCollection(rawDeck, resolved, colorPref);
    if (adjustments.length) {
      deck.warnings = [...deck.warnings, ...adjustments];
    }

    const validation = validateDeck(deck, resolved);
    if (validation.valid) {
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
  const { deck, adjustments } = trimDeckToCollection(rawDeck, resolved, colorPref);
  deck.warnings = [...deck.warnings, ...adjustments, ...lastErrors];

  return { deck, validationErrors: lastErrors };
}

export async function buildDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
  colorPref?: string[],
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(format, resolved, strategyHint, colorPref);
  const baseMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(format) },
    { role: "user", content: userMessage },
  ];
  return runDeckGeneration(format, resolved, baseMessages, 3, colorPref);
}

export async function refineDeckWithAI(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  previousDeck: BuiltDeck,
  errors: string[],
  strategyHint?: string,
  colorPref?: string[],
): Promise<{ deck: BuiltDeck; validationErrors: string[] }> {
  const userMessage = buildBaseUserMessage(format, resolved, strategyHint, colorPref);
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

  return runDeckGeneration(format, resolved, baseMessages, 4, colorPref);
}
