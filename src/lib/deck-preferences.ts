import type { PowerLevelId } from "./power-levels";
import { POWER_LEVELS } from "./power-levels";
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

export type DeckBuildPreferences = {
  powerLevel?: PowerLevelId;
  avoidCards?: string[];
  houseRules?: HouseRules;
  politicsFriendly?: boolean;
};

/** Parse newline/comma-separated card names from the avoid-list text box. */
export function parseAvoidList(text: string): string[] {
  const names = new Set<string>();
  for (const part of text.split(/[\n,]+/)) {
    const trimmed = part.trim();
    if (trimmed.length >= 2) names.add(trimmed);
  }
  return [...names];
}

/** Build a set of nameKeys for hard post-processing (trim) enforcement. */
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
      const display = getDisplayName(item.card);
      const entryKey = nameKey(item.entry.name);
      const displayKey = nameKey(display);
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

const MLD_NAME_FRAGMENTS = [
  "armageddon",
  "ravages of war",
  "jokulhaups",
  "obliterate",
  "boom // bust",
  "fall of the thran",
  "wildfire",
  "cleansing wildfire",
];

const COMBO_NAME_FRAGMENTS = [
  "thassa's oracle",
  "thassas oracle",
  "demonic consultation",
  "tainted pact",
  "isochron scepter",
  "dramatic reversal",
  "heliod, sun-crowned",
  "walking ballista",
  "kiki-jiki",
  "splinter twin",
  "underworld breach",
  "lion's eye diamond",
  "ad nauseam",
  "thoracle",
];

const EXTRA_TURN_NAME_FRAGMENTS = [
  "time warp",
  "temporal manipulation",
  "capture of jingzhou",
  "alrund's epiphany",
  "expropriate",
  "rise of the dark realms",
];

function oracleText(card: ScryfallCard): string {
  const main = card.oracle_text ?? "";
  const face = card.card_faces?.[0]?.oracle_text ?? "";
  return `${main} ${face}`.toLowerCase();
}

function nameMatchesFragments(name: string, fragments: string[]): boolean {
  const n = nameKey(name);
  return fragments.some((f) => n.includes(nameKey(f)));
}

export function cardViolatesHouseRules(
  card: ScryfallCard,
  rules: HouseRules,
): string | null {
  const name = getDisplayName(card);
  const text = oracleText(card);

  if (rules.noMassLandDestruction) {
    if (
      nameMatchesFragments(name, MLD_NAME_FRAGMENTS) ||
      /\bdestroy all lands\b/.test(text) ||
      /\beach player sacrifices all lands\b/.test(text) ||
      (/\bdestroy\b/.test(text) &&
        /\bland\b/.test(text) &&
        /\ball\b/.test(text))
    ) {
      return "mass land destruction";
    }
  }

  if (rules.noInfiniteCombos) {
    if (
      nameMatchesFragments(name, COMBO_NAME_FRAGMENTS) ||
      (/\binfinite\b/.test(text) &&
        (/\bwin the game\b/.test(text) || /\bdamage\b/.test(text))) ||
      /\byou win the game\b/.test(text)
    ) {
      return "infinite / game-winning combo piece";
    }
  }

  if (rules.noExtraTurns) {
    if (
      nameMatchesFragments(name, EXTRA_TURN_NAME_FRAGMENTS) ||
      /\bextra turn\b/.test(text) ||
      /\btake an extra turn\b/.test(text)
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
      "- NO extra-turn engines (Time Warp, Alrund's Epiphany, Capture of Jingzhou, etc.) beyond at most ONE if absolutely central to a fair plan.",
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
- Avoid "I win, you lose" cards that target one player (Braids, Stax locks, Mind Twist on one player).
- If you include removal, prefer flexible answers over hard locks.
- The deck should feel fair to sit across from at a local game store.`;
}

export function buildPreferencesPromptBlock(
  format: string,
  prefs: DeckBuildPreferences,
): string {
  const parts: string[] = [];
  const avoid = getAvoidListPromptBlock(prefs.avoidCards ?? []);
  if (avoid) parts.push(avoid);
  const house = getHouseRulesPromptBlock(prefs.houseRules ?? DEFAULT_HOUSE_RULES);
  if (house) parts.push(house);
  const politics = getPoliticsFriendlyPromptBlock(format, !!prefs.politicsFriendly);
  if (politics) parts.push(politics);
  return parts.join("\n\n");
}

/** Map bracket target to approximate 1–10 score band for comparison with estimate. */
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
    message = `Deck reads hotter than ${meta.label} (${estimatedScore}/10 vs ~${band.max} max). You may stomp casual tables — consider Casual or Focused, or use the ban list.`;
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
