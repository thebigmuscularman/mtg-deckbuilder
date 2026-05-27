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
