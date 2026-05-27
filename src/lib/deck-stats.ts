import type { BuiltDeck, FormatId, ScryfallCard } from "./types";
import { isBasicLand } from "./formats";
import { getDisplayName } from "./scryfall";

export type CurveBucket = {
  label: string;
  cmc: number;
  count: number;
};

export type DeckStats = {
  mainCount: number;
  landCount: number;
  nonLandCount: number;
  avgCmc: number;
  colorPips: Record<string, number>;
  curve: CurveBucket[];
};

export type PowerLevelResult = {
  score: number;
  label: string;
  factors: string[];
};

const CURVE_LABELS: Array<{ cmc: number; label: string }> = [
  { cmc: 0, label: "0" },
  { cmc: 1, label: "1" },
  { cmc: 2, label: "2" },
  { cmc: 3, label: "3" },
  { cmc: 4, label: "4" },
  { cmc: 5, label: "5" },
  { cmc: 6, label: "6+" },
];

function curveBucket(cmc: number): number {
  if (cmc >= 6) return 6;
  return Math.max(0, Math.floor(cmc));
}

function pipCountsFromCost(manaCost?: string): Record<string, number> {
  const pips: Record<string, number> = {};
  if (!manaCost) return pips;
  const symbols = manaCost.match(/\{[^}]+\}/g) ?? [];
  for (const sym of symbols) {
    const inner = sym.slice(1, -1);
    if (/^[WUBRG]$/.test(inner)) {
      pips[inner] = (pips[inner] ?? 0) + 1;
    }
  }
  return pips;
}

export function computeDeckStats(
  lines: Array<{ quantity: number; card: ScryfallCard | null }>,
): DeckStats {
  let mainCount = 0;
  let landCount = 0;
  let cmcSum = 0;
  let cmcCards = 0;
  const colorPips: Record<string, number> = {};
  const curveCounts = new Map<number, number>();

  for (const { quantity, card } of lines) {
    if (!card) continue;
    mainCount += quantity;
    const name = getDisplayName(card);
    const isLand =
      isBasicLand(name) || (card.type_line ?? "").toLowerCase().includes("land");
    if (isLand) landCount += quantity;
    else {
      const cmc = Math.max(0, card.cmc ?? 0);
      cmcSum += cmc * quantity;
      cmcCards += quantity;
      const bucket = curveBucket(cmc);
      curveCounts.set(bucket, (curveCounts.get(bucket) ?? 0) + quantity);
      const pips = pipCountsFromCost(card.mana_cost);
      for (const [c, n] of Object.entries(pips)) {
        colorPips[c] = (colorPips[c] ?? 0) + n * quantity;
      }
    }
  }

  const curve: CurveBucket[] = CURVE_LABELS.map(({ cmc, label }) => ({
    label,
    cmc,
    count: curveCounts.get(cmc) ?? 0,
  }));

  return {
    mainCount,
    landCount,
    nonLandCount: mainCount - landCount,
    avgCmc: cmcCards > 0 ? cmcSum / cmcCards : 0,
    colorPips,
    curve,
  };
}

export function getLandWarnings(
  format: FormatId,
  stats: DeckStats,
): string[] {
  const warnings: string[] = [];
  if (format === "commander") {
    if (stats.landCount < 33) {
      warnings.push(
        `Only ${stats.landCount} lands — Commander decks usually want 35–38+ lands.`,
      );
    } else if (stats.landCount > 42) {
      warnings.push(
        `${stats.landCount} lands is high — you may be light on interaction and threats.`,
      );
    }
  } else {
    if (stats.landCount < 22) {
      warnings.push(
        `Only ${stats.landCount} lands — 60-card decks usually want 22–26 lands.`,
      );
    } else if (stats.landCount > 26) {
      warnings.push(
        `${stats.landCount} lands is above typical — watch for a shallow threat density.`,
      );
    }
  }
  return warnings;
}

const FAST_MANA = new Set([
  "sol ring",
  "mana crypt",
  "mana vault",
  "chrome mox",
  "mox diamond",
  "jeweled lotus",
  "grim monolith",
]);

const TUTOR_PATTERNS = [
  "tutor",
  "search your library",
  "transmute",
  "gamble",
  "imperial seal",
  "demonic tutor",
  "vampiric tutor",
];

export function estimateCommanderPowerLevel(
  deck: BuiltDeck,
  lines: Array<{ quantity: number; card: ScryfallCard | null }>,
  commander: ScryfallCard | null,
): PowerLevelResult | null {
  if (deck.format !== "commander") return null;

  let score = 4;
  const factors: string[] = [];

  const names = lines
    .filter((l) => l.card)
    .flatMap((l) => Array(l.quantity).fill(getDisplayName(l.card!).toLowerCase()));

  const fastMana = names.filter((n) => FAST_MANA.has(n)).length;
  if (fastMana >= 3) {
    score += 2;
    factors.push(`${fastMana} fast mana pieces`);
  } else if (fastMana >= 1) {
    score += 1;
    factors.push("Some fast mana");
  }

  let tutors = 0;
  for (const line of lines) {
    if (!line.card?.oracle_text) continue;
    const text = line.card.oracle_text.toLowerCase();
    if (TUTOR_PATTERNS.some((p) => text.includes(p))) tutors += line.quantity;
  }
  if (tutors >= 6) {
    score += 2;
    factors.push("Heavy tutor package");
  } else if (tutors >= 3) {
    score += 1;
    factors.push("Solid tutors");
  }

  const stats = computeDeckStats(lines);
  if (stats.avgCmc <= 2.4) {
    score += 1;
    factors.push("Low average CMC (speed)");
  } else if (stats.avgCmc >= 4.2) {
    score -= 1;
    factors.push("High average CMC (slow)");
  }

  if (commander) {
    const ci = commander.color_identity?.length ?? 0;
    if (ci >= 3) {
      score += 0.5;
      factors.push("Multicolor mana base stress");
    }
  }

  const comboHints = names.filter((n) =>
    ["thoracle", "consultation", "isochron scepter", "dramatic reversal"].some(
      (c) => n.includes(c),
    ),
  );
  if (comboHints.length) {
    score += 1.5;
    factors.push("Known combo lines detected");
  }

  score = Math.min(10, Math.max(1, Math.round(score * 10) / 10));

  let label = "Casual";
  if (score >= 8) label = "High / cEDH-adjacent";
  else if (score >= 6.5) label = "Focused / Upgraded";
  else if (score >= 5) label = "Tuned precon+";
  else if (score >= 3.5) label = "Battlecruiser";

  return { score, label, factors };
}
