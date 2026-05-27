import type { PowerLevelId } from "./power-levels";
import { POWER_LEVELS } from "./power-levels";
import {
  COMBO_CARD_KEYS,
  EXTRA_TURN_CARD_KEYS,
  isExactCardName,
  MLD_CARD_KEYS,
} from "./house-rules-cards";
import type { ScryfallCard } from "./types";
import { getDisplayName, nameKey } from "./scryfall";

export type HouseRules = {
  noMassLandDestruction: boolean;
  noInfiniteCombos: boolean;
  noExtraTurns: boolean;
};

export const DEFAULT_HOUSE_RULES: HouseRules = {
  noMassLandDestruction: false,
  noInfiniteCombos: false,
  noExtraTurns: false,
};

export type InteractionDensity = "light" | "balanced" | "heavy";
export type GameLength = "fast" | "balanced" | "grindy";

export type DeckBuildPreferences = {
  powerLevel?: PowerLevelId;
  avoidCards?: string[];
  houseRules?: HouseRules;
  politicsFriendly?: boolean;
  allowIllegal?: boolean;
  interactionDensity?: InteractionDensity;
  gameLength?: GameLength;
  /** Target mainboard land count (e.g. 36 Commander, 24 aggro). */
  landsTarget?: number;
};

export function parseAvoidList(text: string): string[] {
  const names = new Set<string>();
  for (const part of text.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 2) names.add(trimmed);
  }
  return [...names];
}

export function buildAvoidNameKeys(
  avoidCards: string[],
  resolved?: Array<{ entry: { name: string }; card: ScryfallCard | null }>,
): Set<string> {
  const keys = new Set<string>();
  for (const name of avoidCards) {
    keys.add(nameKey(name));
  }
  if (resolved) {
    for (const item of resolved) {
      if (!item.card) continue;
      const entryKey = nameKey(item.entry.name);
      const displayKey = nameKey(getDisplayName(item.card));
      if (keys.has(entryKey) || keys.has(displayKey)) {
        keys.add(entryKey);
        keys.add(displayKey);
      }
    }
  }
  return keys;
}

export function isNameAvoided(name: string, avoidKeys: Set<string>): boolean {
  if (!avoidKeys.size) return false;
  return avoidKeys.has(nameKey(name));
}

function oracleText(card: ScryfallCard): string {
  const main = card.oracle_text ?? "";
  const face = card.card_faces?.[0]?.oracle_text ?? "";
  return `${main} ${face}`.toLowerCase();
}

export function cardViolatesHouseRules(
  card: ScryfallCard,
  rules: HouseRules,
): string | null {
  const name = getDisplayName(card);
  const text = oracleText(card);

  if (rules.noMassLandDestruction) {
    if (
      isExactCardName(name, MLD_CARD_KEYS) ||
      /\bdestroy all lands\b/.test(text) ||
      /\beach player sacrifices all lands\b/.test(text)
    ) {
      return "mass land destruction";
    }
  }

  if (rules.noInfiniteCombos) {
    if (
      isExactCardName(name, COMBO_CARD_KEYS) ||
      /\byou win the game\b/.test(text) ||
      (/\binfinite\b/.test(text) && /\bwin the game\b/.test(text))
    ) {
      return "infinite / game-winning combo piece";
    }
  }

  if (rules.noExtraTurns) {
    if (
      isExactCardName(name, EXTRA_TURN_CARD_KEYS) ||
      /\btake an extra turn\b/.test(text) ||
      /\bextra turns?\b/.test(text)
    ) {
      return "extra turn effect";
    }
  }

  return null;
}

export function getAvoidListPromptBlock(avoidCards: string[]): string | null {
  if (!avoidCards.length) return null;
  return `*** USER BAN LIST — NEVER INCLUDE ***
The user has explicitly banned these cards. Do NOT include them in the deck, sideboard, or as commander, even if they appear in the collection list:
${avoidCards.map((n) => `- ${n}`).join("\n")}
If the deck would normally want one of these cards, pick a different card that fills the same role.`;
}

export function getHouseRulesPromptBlock(rules: HouseRules): string | null {
  const lines: string[] = [];
  if (rules.noMassLandDestruction) {
    lines.push(
      "- NO mass land destruction (Armageddon, Ravages of War, Jokulhaups, Obliterate, Wildfire, etc.).",
    );
  }
  if (rules.noInfiniteCombos) {
    lines.push(
      "- NO two-card infinite combos or \"you win the game\" lines (Thoracle Consult, Isochron + Dramatic Reversal, Heliod + Ballista, etc.).",
    );
  }
  if (rules.noExtraTurns) {
    lines.push(
      "- NO extra-turn engines (Time Warp, Alrund's Epiphany, Capture of Jingzhou, etc.).",
    );
  }
  if (!lines.length) return null;
  return `*** HOUSE RULES — HARD CONSTRAINT ***
These are non-negotiable table rules. Do not include cards that violate them:
${lines.join("\n")}`;
}

export function getPoliticsFriendlyPromptBlock(
  format: string,
  enabled: boolean,
): string | null {
  if (!enabled || format !== "commander") return null;
  return `*** POLITICS-FRIENDLY COMMANDER — HARD CONSTRAINT ***
The user wants a deck that wins games without making enemies at the table:
- Prefer group-hug, pillowfort, go-wide tokens, and "everyone draws / gets a Treasure" effects over solitaire combo turns.
- Win through combat damage, incremental value, or a single flashy finisher after a long game — not turn-3 infinite loops.
- Include 2-4 "political" cards (Smothering Tithe, Ghostly Prison, Propaganda, Homeward Path, Tempt with Discovery) if in the collection.
- Avoid "I win, you lose" cards that target one player (hard stax locks, Mind Twist on one player).
- If you include removal, prefer flexible answers over hard locks.
- The deck should feel fair to sit across from at a local game store.`;
}

export function getAllowIllegalPromptBlock(allow: boolean): string | null {
  if (!allow) return null;
  return `*** ALLOW FORMAT-ILLEGAL CARDS ***
The user allows cards from their collection even if Scryfall marks them not legal in this format (e.g. Sol Ring in Modern, banned cards in Commander).
- You may include any card from the collection list regardless of format legality on Scryfall.
- Still obey copy limits, color identity, deck size, and collection quantities.`;
}

export function getInteractionDensityPromptBlock(
  density: InteractionDensity,
): string | null {
  const blocks: Record<InteractionDensity, string> = {
    light: `*** INTERACTION DENSITY: LIGHT ***
Aim for ~5-8 interaction slots total (removal, counters, wipes combined). Prioritize your game plan; assume the table handles problems.`,
    balanced: `*** INTERACTION DENSITY: BALANCED ***
Aim for ~10-14 interaction slots — spot removal, 1-2 board wipes, and a few flexible answers without becoming a control deck.`,
    heavy: `*** INTERACTION DENSITY: HEAVY ***
Aim for ~16-22 interaction slots — multiple removal spells, counterspells, and board wipes. You are the table's police; still need a win condition.`,
  };
  return blocks[density];
}

export function getGameLengthPromptBlock(length: GameLength): string | null {
  const blocks: Record<GameLength, string> = {
    fast: `*** GAME LENGTH: FAST ***
Build for games that end turns 6-9: low curve (avg CMC ~2.2-2.8), fewer than 24 lands in 60-card / fewer than 35 in Commander unless ramp-heavy, aggressive threats and reach.`,
    balanced: `*** GAME LENGTH: BALANCED ***
Standard mana base: ~22-25 lands in 60-card, ~35-38 in Commander. Mix early plays with mid-game and 2-4 finishers.`,
    grindy: `*** GAME LENGTH: GRINDY ***
Build for long games: higher land count, card draw, recursion, and inevitability. Include 2-4 haymakers that close after a long game.`,
  };
  return blocks[length];
}

export function getLandsTargetPromptBlock(
  format: string,
  landsTarget: number,
): string | null {
  if (!landsTarget || landsTarget < 18 || landsTarget > 45) return null;
  return `*** LAND COUNT TARGET: ${landsTarget} ***
The mainboard should include exactly ${landsTarget} lands (basic + nonbasic). Adjust non-land slots to hit format card count with this land total.`;
}

export function buildPreferencesPromptBlock(
  format: string,
  prefs: DeckBuildPreferences,
): string {
  const blocks = [
    getAvoidListPromptBlock(prefs.avoidCards ?? []),
    getHouseRulesPromptBlock(prefs.houseRules ?? DEFAULT_HOUSE_RULES),
    getPoliticsFriendlyPromptBlock(format, !!prefs.politicsFriendly),
    getAllowIllegalPromptBlock(!!prefs.allowIllegal),
    prefs.interactionDensity
      ? getInteractionDensityPromptBlock(prefs.interactionDensity)
      : null,
    prefs.gameLength ? getGameLengthPromptBlock(prefs.gameLength) : null,
    prefs.landsTarget
      ? getLandsTargetPromptBlock(format, prefs.landsTarget)
      : null,
  ].filter((b): b is string => Boolean(b));
  return blocks.join("\n\n");
}

export const TARGET_POWER_SCORE: Record<
  PowerLevelId,
  { min: number; max: number; label: string }
> = {
  casual: { min: 1, max: 4.5, label: "Casual" },
  focused: { min: 4, max: 6.5, label: "Focused" },
  optimized: { min: 6, max: 8, label: "Optimized" },
  high: { min: 7.5, max: 10, label: "High Power" },
};

export type PowerTargetComparison = {
  targetId: PowerLevelId;
  targetLabel: string;
  targetBracket: string;
  estimatedScore: number;
  estimatedLabel: string;
  status: "match" | "high" | "low";
  message: string;
};

export function comparePowerToTarget(
  estimatedScore: number,
  estimatedLabel: string,
  targetId: PowerLevelId,
): PowerTargetComparison {
  const band = TARGET_POWER_SCORE[targetId];
  const meta = POWER_LEVELS[targetId];
  let status: PowerTargetComparison["status"] = "match";
  let message = `Estimated power (${estimatedScore}/10) fits your ${meta.label} target.`;

  if (estimatedScore > band.max + 0.5) {
    status = "high";
    message = `Deck reads hotter than ${meta.label} (${estimatedScore}/10 vs ~${band.max} max). You may stomp casual tables — try Casual/Focused or add cards to your ban list.`;
  } else if (estimatedScore < band.min - 0.5) {
    status = "low";
    message = `Deck reads softer than ${meta.label} (${estimatedScore}/10 vs ~${band.min}+ expected). Bump power level or strategy if you want more punch.`;
  }

  return {
    targetId,
    targetLabel: meta.label,
    targetBracket: meta.bracket,
    estimatedScore,
    estimatedLabel,
    status,
    message,
  };
}

export function suggestPowerLevelAdjustment(
  status: PowerTargetComparison["status"],
  current: PowerLevelId,
): PowerLevelId | null {
  const order: PowerLevelId[] = ["casual", "focused", "optimized", "high"];
  const idx = order.indexOf(current);
  if (idx < 0) return null;
  if (status === "high" && idx > 0) return order[idx - 1];
  if (status === "low" && idx < order.length - 1) return order[idx + 1];
  return null;
}
