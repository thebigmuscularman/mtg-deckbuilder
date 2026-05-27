import { describe, expect, it } from "vitest";
import { trimDeckToCollection } from "./trim";
import type { BuiltDeck } from "../types";
import { mockCard, resolved } from "../test-helpers";

describe("trimDeckToCollection", () => {
  const bolt = mockCard({ name: "Lightning Bolt", color_identity: ["R"] });
  const solRing = mockCard({
    name: "Sol Ring",
    type_line: "Artifact",
    color_identity: [],
  });
  const mountain = mockCard({
    name: "Mountain",
    type_line: "Basic Land — Mountain",
    color_identity: ["R"],
  });

  const collection = [
    resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
    resolved({ name: "Sol Ring", quantity: 1 }, solRing),
    resolved({ name: "Mountain", quantity: 30 }, mountain),
  ];

  it("drops cards on the ban list", () => {
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Sol Ring", quantity: 1 },
        { name: "Lightning Bolt", quantity: 4 },
        ...Array.from({ length: 55 }, () => ({
          name: "Mountain",
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      collection,
      undefined,
      undefined,
      { avoidCards: ["Sol Ring"] },
    );
    expect(trimmed.mainboard.some((l) => l.name === "Sol Ring")).toBe(false);
    expect(adjustments.some((a) => a.includes("ban list"))).toBe(true);
  });

  it("clamps quantity to owned copies", () => {
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Lightning Bolt", quantity: 8 },
        ...Array.from({ length: 56 }, () => ({
          name: "Mountain",
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed } = trimDeckToCollection(deck, collection);
    const boltLine = trimmed.mainboard.find((l) => l.name === "Lightning Bolt");
    expect(boltLine?.quantity).toBe(4);
  });

  it("enforces a land floor by swapping spells for owned basics", () => {
    // 14 unique red spells × 4 copies each = 56 spells, plus 4 Mountains = 60 cards.
    const spellCards = Array.from({ length: 14 }, (_, i) =>
      mockCard({ name: `Burn Spell ${i}`, color_identity: ["R"] }),
    );
    const richCollection = [
      ...spellCards.map((c) =>
        resolved({ name: c.name, quantity: 4 }, c),
      ),
      resolved({ name: "Mountain", quantity: 60 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Lava-only Burn",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        ...spellCards.map((c) => ({ name: c.name, quantity: 4 })),
        { name: "Mountain", quantity: 4 },
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const total = deck.mainboard.reduce((s, l) => s + l.quantity, 0);
    expect(total).toBe(60);

    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      richCollection,
    );
    const lands = trimmed.mainboard
      .filter((l) => l.name === "Mountain")
      .reduce((s, l) => s + l.quantity, 0);
    expect(lands).toBeGreaterThanOrEqual(22);
    expect(trimmed.mainboard.reduce((s, l) => s + l.quantity, 0)).toBe(60);
    expect(adjustments.some((a) => a.includes("Land floor enforced"))).toBe(true);
  });

  it("backfills basics even when the collection has no basic-land entries", () => {
    // User uploaded a Moxfield/Archidekt CSV that omitted basics.
    // The AI ships a deck with too few lands.
    // We should still ship a playable 60-card deck with ≥22 lands.
    const spellCards = Array.from({ length: 12 }, (_, i) =>
      mockCard({ name: `Bolt Variant ${i}`, color_identity: ["R"] }),
    );
    const noBasicsCollection = spellCards.map((c) =>
      resolved({ name: c.name, quantity: 5 }, c),
    );
    const deck: BuiltDeck = {
      name: "Mostly Spells",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        ...spellCards.map((c) => ({ name: c.name, quantity: 4 })),
        { name: "Mountain", quantity: 6 },
        { name: "Plains", quantity: 6 },
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed } = trimDeckToCollection(deck, noBasicsCollection);
    const total = trimmed.mainboard.reduce((s, l) => s + l.quantity, 0);
    expect(total).toBe(60);
    const landCount = trimmed.mainboard
      .filter((l) =>
        ["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(l.name),
      )
      .reduce((s, l) => s + l.quantity, 0);
    expect(landCount).toBeGreaterThanOrEqual(22);
  });

  it("drops cards over budget cap", () => {
    const expensive = mockCard({
      name: "Expensive Rock",
      prices: { usd: "50.00" },
    });
    const cheap = mockCard({
      name: "Cheap Spell",
      prices: { usd: "0.25" },
      color_identity: ["R"],
    });
    const coll = [
      resolved({ name: "Expensive Rock", quantity: 1 }, expensive),
      resolved({ name: "Cheap Spell", quantity: 4 }, cheap),
      resolved({ name: "Mountain", quantity: 56 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Expensive Rock", quantity: 1 },
        { name: "Cheap Spell", quantity: 4 },
        ...Array.from({ length: 55 }, () => ({
          name: "Mountain",
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      coll,
      undefined,
      5,
    );
    expect(trimmed.mainboard.some((l) => l.name === "Expensive Rock")).toBe(
      false,
    );
    expect(adjustments.some((a) => a.includes("over budget"))).toBe(true);
  });
});
