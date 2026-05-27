import { describe, expect, it } from "vitest";
import { validateDeck } from "./deck-validation";
import type { BuiltDeck } from "./types";
import { mockCard, resolved } from "./test-helpers";

describe("validateDeck", () => {
  const bolt = mockCard({ name: "Lightning Bolt", color_identity: ["R"] });
  const island = mockCard({
    name: "Island",
    type_line: "Basic Land — Island",
    color_identity: [],
  });

  const collection = [
    resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
    resolved({ name: "Island", quantity: 56 }, island),
  ];

  it("rejects non-common cards in Pauper", () => {
    const rare = mockCard({
      name: "Snapcaster Mage",
      rarity: "rare",
      color_identity: ["U"],
    });
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "pauper",
      commander: null,
      mainboard: Array.from({ length: 56 }, () => ({
        name: "Lightning Bolt",
        quantity: 1,
      })).concat(
        { name: "Snapcaster Mage", quantity: 4 },
        { name: "Island", quantity: 20 },
      ),
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const result = validateDeck(deck, [
      ...collection,
      resolved({ name: "Snapcaster Mage", quantity: 4 }, rare),
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not common"))).toBe(true);
  });

  it("accepts a 60-card Modern mainboard from collection", () => {
    const deck: BuiltDeck = {
      name: "Burn",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Lightning Bolt", quantity: 4 },
        { name: "Island", quantity: 56 },
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const result = validateDeck(deck, collection);
    expect(result.valid).toBe(true);
  });
});

describe("validateDeck allowIllegal", () => {
  const solRing = mockCard({
    name: "Sol Ring",
    type_line: "Artifact",
    legalities: { modern: "not_legal", commander: "legal" },
  });

  const collection = [
    resolved({ name: "Sol Ring", quantity: 1 }, solRing),
    ...Array.from({ length: 59 }, (_, i) =>
      resolved(
        { name: `Island ${i}`, quantity: 1 },
        mockCard({
          name: `Island ${i}`,
          type_line: "Basic Land — Island",
        }),
      ),
    ),
  ];

  it("rejects Sol Ring in Modern by default", () => {
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Sol Ring", quantity: 1 },
        ...Array.from({ length: 59 }, (_, i) => ({
          name: `Island ${i}`,
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const result = validateDeck(deck, collection);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("not legal"))).toBe(true);
  });

  it("allows Sol Ring in Modern when allowIllegal is set", () => {
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Sol Ring", quantity: 1 },
        ...Array.from({ length: 59 }, (_, i) => ({
          name: `Island ${i}`,
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const result = validateDeck(deck, collection, { allowIllegal: true });
    expect(result.errors.every((e) => !e.includes("not legal"))).toBe(true);
  });
});
