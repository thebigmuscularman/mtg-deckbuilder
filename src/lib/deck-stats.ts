import type { BuiltDeck, FormatId, ScryfallCard } from "./types";
import { isBasicLand } from "./formats";
import { getDisplayName, nameKey } from "./scryfall";

type Line = { quantity: number; card: ScryfallCard | null };

export function cardCountsAsLand(
  card: ScryfallCard | null,
  fallbackName?: string,
): boolean {
  if (card) {
    const name = getDisplayName(card);
    return (
      isBasicLand(name) || (card.type_line ?? "").toLowerCase().includes("land")
    );
  }
  return fallbackName ? isBasicLand(fallbackName) : false;
}

export function countLandsInLines(
  lines: Array<{ name: string; quantity: number }>,
  resolveCard: (line: { name: string }) => ScryfallCard | null,
): number {
  return lines.reduce(
    (sum, line) =>
      cardCountsAsLand(resolveCard(line), line.name)
        ? sum + line.quantity
        : sum,
    0,
  );
}

export type CurveBucket = { label: string; cmc: number; count: number };

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

function pipCountsFromCost(manaCost?: string): Record<string, number> {
  const pips: Record<string, number> = {};
  const symbols = manaCost?.match(/\{[^}]+\}/g) ?? [];
  for (const sym of symbols) {
    const inner = sym.slice(1, -1);
    if (/^[WUBRG]$/.test(inner)) pips[inner] = (pips[inner] ?? 0) + 1;
  }
  return pips;
}

export function computeDeckStats(lines: Line[]): DeckStats {
  let mainCount = 0;
  let landCount = 0;
  let cmcSum = 0;
  let cmcCards = 0;
  const colorPips: Record<string, number> = {};
  const curveCounts = new Map<number, number>();

  for (const { quantity, card } of lines) {
    if (!card) continue;
    mainCount += quantity;
    if (cardCountsAsLand(card)) {
      landCount += quantity;
      continue;
    }
    const cmc = Math.max(0, card.cmc ?? 0);
    cmcSum += cmc * quantity;
    cmcCards += quantity;
    const bucket = cmc >= 6 ? 6 : Math.floor(cmc);
    curveCounts.set(bucket, (curveCounts.get(bucket) ?? 0) + quantity);
    for (const [c, n] of Object.entries(pipCountsFromCost(card.mana_cost))) {
      colorPips[c] = (colorPips[c] ?? 0) + n * quantity;
    }
  }

  return {
    mainCount,
    landCount,
    nonLandCount: mainCount - landCount,
    avgCmc: cmcCards > 0 ? cmcSum / cmcCards : 0,
    colorPips,
    curve: CURVE_LABELS.map(({ cmc, label }) => ({
      label,
      cmc,
      count: curveCounts.get(cmc) ?? 0,
    })),
  };
}

export function getLandWarnings(format: FormatId, stats: DeckStats): string[] {
  const cmd = format === "commander";
  const min = cmd ? 33 : 22;
  const max = cmd ? 42 : 26;
  const target = cmd ? "35–38+" : "22–26";
  if (stats.landCount < min) {
    return [
      `Only ${stats.landCount} lands — ${cmd ? "Commander" : "60-card"} decks usually want ${target} lands.`,
    ];
  }
  if (stats.landCount > max) {
    return [
      cmd
        ? `${stats.landCount} lands is high — you may be light on interaction and threats.`
        : `${stats.landCount} lands is above typical — watch for a shallow threat density.`,
    ];
  }
  return [];
}

/**
 * Diagnose a deck's mana curve. Flags the pathologies the AI tends to fall
 * into: average CMC outside the format's healthy band, too few 1–2 mana plays,
 * and too many 5+ mana cards. Returns user-facing warning strings.
 */
export function getCurveWarnings(format: FormatId, stats: DeckStats): string[] {
  const out: string[] = [];
  if (stats.nonLandCount < 10) return out;
  const cmd = format === "commander";
  const earlyDrops = stats.curve
    .filter((b) => b.cmc <= 2)
    .reduce((s, b) => s + b.count, 0);
  const topHeavy = stats.curve
    .filter((b) => b.cmc >= 5)
    .reduce((s, b) => s + b.count, 0);
  const earlyMin = cmd ? 14 : 10;
  const topMax = cmd ? 16 : 8;
  const avgMax = cmd ? 3.8 : 3.2;
  const avgMin = cmd ? 2.2 : 1.8;

  if (stats.avgCmc > avgMax) {
    out.push(
      `Average non-land CMC is ${stats.avgCmc.toFixed(1)} — that's slow for ${cmd ? "Commander" : format} (target ≤${avgMax.toFixed(1)}). Trim some 5+ drops for cheaper plays.`,
    );
  } else if (stats.avgCmc > 0 && stats.avgCmc < avgMin) {
    out.push(
      `Average non-land CMC is ${stats.avgCmc.toFixed(1)} — very low for ${cmd ? "Commander" : format} (target ≥${avgMin.toFixed(1)}). The deck may fizzle late.`,
    );
  }
  if (earlyDrops < earlyMin) {
    out.push(
      `Only ${earlyDrops} card${earlyDrops === 1 ? "" : "s"} at 1–2 mana — early turns will be empty. Aim for at least ${earlyMin}.`,
    );
  }
  if (topHeavy > topMax) {
    out.push(
      `${topHeavy} cards at 5+ mana — top-heavy curve. Aim for ≤${topMax} or you'll get stuck on lands without plays.`,
    );
  }
  return out;
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

function flatNames(lines: Line[]): string[] {
  return lines
    .filter((l) => l.card)
    .flatMap((l) =>
      Array(l.quantity).fill(nameKey(getDisplayName(l.card!))),
    );
}

function countTutors(lines: Line[]): number {
  return lines.reduce((sum, line) => {
    const text = line.card?.oracle_text?.toLowerCase();
    if (!text) return sum;
    return TUTOR_PATTERNS.some((p) => text.includes(p))
      ? sum + line.quantity
      : sum;
  }, 0);
}

function labelForScore(
  score: number,
  thresholds: Array<{ at: number; label: string }>,
  base: string,
): string {
  for (const { at, label } of thresholds) if (score >= at) return label;
  return base;
}

function clamp(score: number): number {
  return Math.min(10, Math.max(1, Math.round(score * 10) / 10));
}

export function estimateDeckPowerLevel(
  deck: BuiltDeck,
  lines: Line[],
  commander: ScryfallCard | null,
): PowerLevelResult {
  const commanderFormat = deck.format === "commander";
  const names = flatNames(lines);
  const fastMana = names.filter((n) => FAST_MANA.has(n)).length;
  const tutors = countTutors(lines);
  const stats = computeDeckStats(lines);
  const factors: string[] = [];

  let score = commanderFormat ? 4 : 3.5;

  if (commanderFormat) {
    if (fastMana >= 3) {
      score += 2;
      factors.push(`${fastMana} fast mana pieces`);
    } else if (fastMana >= 1) {
      score += 1;
      factors.push("Some fast mana");
    }
    if (tutors >= 6) {
      score += 2;
      factors.push("Heavy tutor package");
    } else if (tutors >= 3) {
      score += 1;
      factors.push("Solid tutors");
    }
    if (stats.avgCmc <= 2.4) {
      score += 1;
      factors.push("Low average CMC (speed)");
    } else if (stats.avgCmc >= 4.2) {
      score -= 1;
      factors.push("High average CMC (slow)");
    }
    if ((commander?.color_identity?.length ?? 0) >= 3) {
      score += 0.5;
      factors.push("Multicolor mana base stress");
    }
    const combos = names.filter((n) =>
      ["thoracle", "consultation", "isochron scepter", "dramatic reversal"].some(
        (c) => n.includes(c),
      ),
    );
    if (combos.length) {
      score += 1.5;
      factors.push("Known combo lines detected");
    }
    return {
      score: clamp(score),
      label: labelForScore(
        clamp(score),
        [
          { at: 8, label: "High / cEDH-adjacent" },
          { at: 6.5, label: "Focused / Upgraded" },
          { at: 5, label: "Tuned precon+" },
          { at: 3.5, label: "Battlecruiser" },
        ],
        "Casual",
      ),
      factors,
    };
  }

  if (fastMana >= 2) {
    score += 1.5;
    factors.push(`${fastMana} fast mana`);
  } else if (fastMana >= 1) {
    score += 0.5;
    factors.push("Some fast mana");
  }
  if (tutors >= 4) {
    score += 1.5;
    factors.push("Tutor density");
  } else if (tutors >= 2) {
    score += 0.5;
    factors.push("Some tutors");
  }
  if (stats.avgCmc <= 2.2) {
    score += 0.5;
    factors.push("Aggressive curve");
  } else if (stats.avgCmc >= 3.8) {
    score -= 0.5;
    factors.push("Slower curve");
  }

  return {
    score: clamp(score),
    label: labelForScore(
      clamp(score),
      [
        { at: 7.5, label: "Competitive" },
        { at: 6, label: "Tuned" },
        { at: 4.5, label: "Mid-power" },
      ],
      "Casual",
    ),
    factors,
  };
}
