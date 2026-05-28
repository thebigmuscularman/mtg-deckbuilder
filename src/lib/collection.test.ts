import { describe, expect, it } from "vitest";
import { formatPromptCardLine } from "./collection";

describe("formatPromptCardLine", () => {
  it("includes mana cost, type, P/T, colors, keywords, and oracle text", () => {
    const line = formatPromptCardLine({
      name: "Akroma, Angel of Wrath",
      quantity: 1,
      typeLine: "Legendary Creature — Angel",
      colors: ["W"],
      cmc: 8,
      manaCost: "{5}{W}{W}{W}",
      keywords: ["Flying", "First strike", "Vigilance"],
      power: "6",
      toughness: "6",
      oracleText: "Flying, first strike, vigilance, trample, haste, protection from black and from red.",
      rarity: "rare",
    });
    expect(line).toContain("Akroma, Angel of Wrath");
    expect(line).toContain("{5}{W}{W}{W}");
    expect(line).toContain("cmc 8");
    expect(line).toContain("6/6");
    expect(line).toContain("[W]");
    expect(line).toContain("Flying");
    expect(line).toContain("protection from black");
  });

  it("truncates extremely long oracle text", () => {
    const long = "Whenever a creature dies, you may draw a card. ".repeat(20);
    const line = formatPromptCardLine({
      name: "Long Card",
      quantity: 1,
      typeLine: "Enchantment",
      colors: ["B"],
      cmc: 4,
      oracleText: long,
    });
    expect(line.length).toBeLessThan(300);
    expect(line).toContain("…");
  });

  it("strips reminder text in parentheses", () => {
    const line = formatPromptCardLine({
      name: "Hexproof Card",
      quantity: 1,
      typeLine: "Creature — Knight",
      colors: ["G"],
      cmc: 3,
      oracleText: "Hexproof (This creature can't be the target of spells or abilities your opponents control.)",
    });
    expect(line).not.toContain("can't be the target");
  });

  it("falls back to bare name + quantity for sparse cards", () => {
    const line = formatPromptCardLine({
      name: "Mountain",
      quantity: 25,
    });
    expect(line).toBe("- 25x Mountain");
  });

  it("does not emit rarity tag for commons", () => {
    const line = formatPromptCardLine({
      name: "Lightning Bolt",
      quantity: 4,
      typeLine: "Instant",
      colors: ["R"],
      cmc: 1,
      rarity: "common",
    });
    expect(line).not.toMatch(/\bC\b/);
  });
});
