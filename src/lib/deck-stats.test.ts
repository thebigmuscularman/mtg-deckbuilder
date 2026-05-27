import { describe, expect, it } from "vitest";
import { computeDeckStats, getCurveWarnings } from "./deck-stats";
import { mockCard } from "./test-helpers";

const land = mockCard({
  name: "Mountain",
  type_line: "Basic Land — Mountain",
  cmc: 0,
});

function spell(name: string, cmc: number) {
  return mockCard({ name, cmc, type_line: "Creature" });
}

function buildLines(
  spellCmcs: number[],
  landCount = 24,
): Array<{ quantity: number; card: ReturnType<typeof spell> }> {
  return [
    ...spellCmcs.map((cmc, i) => ({
      quantity: 1,
      card: spell(`Spell ${i}`, cmc),
    })),
    { quantity: landCount, card: land },
  ];
}

describe("getCurveWarnings", () => {
  it("returns no warnings for a healthy 60-card curve", () => {
    const lines = buildLines([
      ...Array(8).fill(1),
      ...Array(12).fill(2),
      ...Array(10).fill(3),
      ...Array(4).fill(4),
      ...Array(2).fill(5),
    ]);
    const stats = computeDeckStats(lines);
    expect(getCurveWarnings("modern", stats)).toEqual([]);
  });

  it("flags top-heavy decks", () => {
    const lines = buildLines([
      ...Array(2).fill(2),
      ...Array(4).fill(5),
      ...Array(10).fill(6),
      ...Array(8).fill(7),
    ]);
    const stats = computeDeckStats(lines);
    const warnings = getCurveWarnings("modern", stats);
    expect(warnings.some((w) => /slow/.test(w))).toBe(true);
    expect(warnings.some((w) => /top-heavy/.test(w))).toBe(true);
  });

  it("flags decks with no early plays", () => {
    const lines = buildLines([
      ...Array(8).fill(3),
      ...Array(8).fill(4),
      ...Array(4).fill(5),
    ]);
    const stats = computeDeckStats(lines);
    const warnings = getCurveWarnings("modern", stats);
    expect(warnings.some((w) => /early turns/.test(w))).toBe(true);
  });

  it("uses commander thresholds for commander decks", () => {
    // 18 cards at 5+ trips the commander top-heavy threshold (>16)
    const cmds = [
      ...Array(8).fill(2),
      ...Array(6).fill(3),
      ...Array(6).fill(4),
      ...Array(10).fill(5),
      ...Array(8).fill(6),
    ];
    const lines = buildLines(cmds, 37);
    const stats = computeDeckStats(lines);
    const warnings = getCurveWarnings("commander", stats);
    expect(warnings.some((w) => /top-heavy/.test(w))).toBe(true);
  });

  it("does nothing for tiny decks (avoids noise on partial builds)", () => {
    const lines = buildLines([2, 3], 5);
    const stats = computeDeckStats(lines);
    expect(getCurveWarnings("modern", stats)).toEqual([]);
  });
});
