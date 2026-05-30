import { isBasicLand } from "../formats";
import { getDisplayName, nameKey } from "../scryfall";
import type { OwnedEntry } from "../deck-validation";
import type { DeckCardLine, FormatId } from "../types";

const BASIC_KEY_BY_COLOR: Record<string, string> = {
  W: "plains",
  U: "island",
  B: "swamp",
  R: "mountain",
  G: "forest",
};

const BASIC_DISPLAY_BY_COLOR: Record<string, string> = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

/**
 * Hand-curated utility lands worth auto-including for a Commander deck when
 * the user owns them. These are uncontroversial picks: color-fixers, broadly
 * useful utility, and graveyard / land hate. Fetches, shocks, and duals are
 * intentionally NOT here because their value is highly archetype-specific —
 * we want a predictable mana base, not the AI re-litigating land choices.
 *
 * Listed in priority order; capped at ~25% of total lands so the deck never
 * becomes "all utility, no Forests".
 */
const COMMANDER_UTILITY_STAPLES: string[] = [
  "Command Tower",
  "Exotic Orchard",
  "Reflecting Pool",
  "Path of Ancestry",
  "Reliquary Tower",
  "Bojuka Bog",
  "Strip Mine",
  "Wasteland",
  "Ghost Quarter",
  "Field of Ruin",
  "Maze of Ith",
  "Mystic Sanctuary",
  "Krosan Verge",
  "Myriad Landscape",
  "Rogue's Passage",
  "Rishadan Port",
  "Cabal Coffers",
  "Nykthos, Shrine to Nyx",
  "Boseiju, Who Endures",
  "Otawara, Soaring City",
  "Takenuma, Abandoned Mire",
  "Sokenzan, Crucible of Defiance",
  "Eiganjo, Seat of the Empire",
];

/** Tally colored mana symbols across a list of spells (hybrid counts as half each). */
function countPipsByColor(
  lines: DeckCardLine[],
  owned: Map<string, OwnedEntry>,
): Record<string, number> {
  const pips: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const line of lines) {
    const card = owned.get(nameKey(line.name))?.card;
    if (!card) continue;
    const cost = card.mana_cost ?? "";
    const symbols = cost.match(/\{[^}]+\}/g) ?? [];
    for (const sym of symbols) {
      const inner = sym.slice(1, -1);
      if (/^[WUBRG]$/.test(inner)) {
        pips[inner] += line.quantity;
        continue;
      }
      const hybrid = inner.match(/^([WUBRG])\/([WUBRG])$/);
      if (hybrid) {
        pips[hybrid[1]] += 0.5 * line.quantity;
        pips[hybrid[2]] += 0.5 * line.quantity;
      }
    }
  }
  return pips;
}

/**
 * Allocate `total` basics across `colors`, weighted by the spell list's
 * colored-pip distribution. Uses largest-remainder rounding so the parts
 * sum exactly to `total`. If colors have zero pips between them, falls
 * back to an even split.
 */
function allocateBasicsByPips(
  spells: DeckCardLine[],
  owned: Map<string, OwnedEntry>,
  colors: string[],
  total: number,
): Record<string, number> {
  if (total <= 0 || colors.length === 0) return {};
  const pips = countPipsByColor(spells, owned);
  const totalPips = colors.reduce((s, c) => s + (pips[c] ?? 0), 0);
  const out: Record<string, number> = {};

  if (totalPips === 0) {
    const base = Math.floor(total / colors.length);
    let leftover = total - base * colors.length;
    for (const c of colors) {
      out[c] = base + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
    }
    return out;
  }

  const raw = colors.map((c) => ({
    color: c,
    share: ((pips[c] ?? 0) / totalPips) * total,
  }));
  const floored = raw.map((r) => ({
    color: r.color,
    n: Math.floor(r.share),
    rem: r.share - Math.floor(r.share),
  }));
  let allocated = floored.reduce((s, r) => s + r.n, 0);
  const byRem = [...floored].sort((a, b) => b.rem - a.rem);
  let i = 0;
  while (allocated < total && i < byRem.length) {
    byRem[i].n++;
    allocated++;
    i++;
  }
  for (const r of floored) out[r.color] = r.n;
  return out;
}

export type AutoManaBaseResult = {
  mainboard: DeckCardLine[];
  staplesAdded: string[];
  basicsAdded: Record<string, number>;
  strippedLandCount: number;
};

/**
 * Replace any lands in `mainboard` with an auto-generated mana base of
 * `landsTarget` cards: owned utility staples first (capped at 25% of lands),
 * then basics distributed across the deck's colors weighted by mana-pip
 * frequency in the picked spells.
 *
 * Spell ordering is preserved; lands are appended at the end of the list.
 */
export function applyAutoManaBase(
  mainboard: DeckCardLine[],
  owned: Map<string, OwnedEntry>,
  format: FormatId,
  options: {
    landsTarget: number;
    commanderColors?: string[];
    prefColors?: string[];
  },
): AutoManaBaseResult {
  const { landsTarget } = options;
  const colors = (options.commanderColors?.length
    ? options.commanderColors
    : options.prefColors ?? []
  ).filter((c) => /^[WUBRG]$/.test(c));

  const isLand = (line: DeckCardLine): boolean => {
    if (isBasicLand(line.name)) return true;
    const card = owned.get(nameKey(line.name))?.card;
    if (!card) return false;
    return (card.type_line ?? "").toLowerCase().includes("land");
  };

  const spellsOnly: DeckCardLine[] = [];
  let strippedLandCount = 0;
  for (const line of mainboard) {
    if (isLand(line)) {
      strippedLandCount += line.quantity;
      continue;
    }
    spellsOnly.push(line);
  }

  if (landsTarget <= 0) {
    return {
      mainboard: spellsOnly,
      staplesAdded: [],
      basicsAdded: {},
      strippedLandCount,
    };
  }

  const newLandLines: DeckCardLine[] = [];
  const staplesAdded: string[] = [];
  const staplesCap =
    format === "commander" ? Math.floor(landsTarget * 0.25) : 0;
  let landsRemaining = landsTarget;
  let staplesUsed = 0;

  if (format === "commander" && staplesCap > 0) {
    for (const stapleName of COMMANDER_UTILITY_STAPLES) {
      if (staplesUsed >= staplesCap || landsRemaining <= 0) break;
      const entry = owned.get(nameKey(stapleName));
      if (!entry) continue;
      const cardId = entry.card.color_identity ?? [];
      if (colors.length && cardId.length) {
        if (!cardId.every((c) => colors.includes(c))) continue;
      }
      const display = getDisplayName(entry.card);
      newLandLines.push({
        name: display,
        quantity: 1,
        reason: "Owned utility staple — auto-added to the mana base.",
        scryfallId: entry.card.id,
      });
      staplesAdded.push(display);
      staplesUsed++;
      landsRemaining--;
    }
  }

  let basicsAdded: Record<string, number> = {};
  if (landsRemaining > 0) {
    if (colors.length) {
      basicsAdded = allocateBasicsByPips(
        spellsOnly,
        owned,
        colors,
        landsRemaining,
      );
      for (const [color, count] of Object.entries(basicsAdded)) {
        if (count <= 0) continue;
        const basicEntry = owned.get(BASIC_KEY_BY_COLOR[color]);
        if (!basicEntry) continue;
        newLandLines.push({
          name: BASIC_DISPLAY_BY_COLOR[color],
          quantity: count,
          reason: "Basic land — auto mana base.",
          scryfallId: basicEntry.card.id,
        });
      }
    } else {
      // Colorless / unknown identity: use whichever basic the user has,
      // preferring Plains as a deterministic default.
      for (const c of "WUBRG") {
        const entry = owned.get(BASIC_KEY_BY_COLOR[c]);
        if (!entry) continue;
        newLandLines.push({
          name: BASIC_DISPLAY_BY_COLOR[c],
          quantity: landsRemaining,
          reason: "Basic land — auto mana base (colorless deck).",
          scryfallId: entry.card.id,
        });
        basicsAdded[c] = landsRemaining;
        landsRemaining = 0;
        break;
      }
    }
  }

  return {
    mainboard: [...spellsOnly, ...newLandLines],
    staplesAdded,
    basicsAdded,
    strippedLandCount,
  };
}

/** The non-land target the AI should hit, given the format and lands budget. */
export function spellTargetFor(
  format: FormatId,
  landsTarget: number,
): number {
  const total = format === "commander" ? 99 : 60;
  return Math.max(0, total - landsTarget);
}

/** Default mainboard land budget when the user hasn't moved the slider. */
export function defaultLandsTargetFor(format: FormatId): number {
  return format === "commander" ? 36 : 23;
}
