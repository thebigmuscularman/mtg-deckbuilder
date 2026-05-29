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

  it("does not pad a collapsed spell base into a land-only deck", () => {
    const coll = [resolved({ name: "Lightning Bolt", quantity: 4 }, bolt)];
    const deck: BuiltDeck = {
      name: "Hallucinated pile",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Lightning Bolt", quantity: 4 },
        ...Array.from({ length: 14 }, (_, i) => ({
          name: `Not In Collection ${i}`,
          quantity: 4,
        })),
        ...Array.from({ length: 6 }, () => ({
          name: "Mountain",
          quantity: 1,
        })),
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(deck, coll);
    const lands = trimmed.mainboard
      .filter((l) =>
        ["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(l.name),
      )
      .reduce((s, l) => s + l.quantity, 0);
    const spells = trimmed.mainboard
      .filter(
        (l) =>
          !["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(
            l.name,
          ),
      )
      .reduce((s, l) => s + l.quantity, 0);

    expect(spells).toBe(4);
    // Virtual stubs let the AI's Mountains survive, but we must not pad to 22–26.
    expect(lands).toBeLessThanOrEqual(6);
    expect(trimmed.mainboard.reduce((s, l) => s + l.quantity, 0)).toBeLessThan(
      30,
    );
    expect(adjustments.some((a) => a.includes("DECK INCOMPLETE"))).toBe(true);
  });

  it("injects user must-include cards that the AI omitted", () => {
    const want = mockCard({ name: "Pet Card", color_identity: ["R"] });
    const coll = [
      resolved({ name: "Pet Card", quantity: 1 }, want),
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Mountain", quantity: 60 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Lightning Bolt", quantity: 4 },
        ...Array.from({ length: 56 }, () => ({
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
      undefined,
      { mustIncludeCards: ["Pet Card"] },
    );
    expect(trimmed.mainboard.some((l) => l.name === "Pet Card")).toBe(true);
    expect(adjustments.some((a) => a.includes("user must-include"))).toBe(true);
  });

  it("flags must-include cards not in the collection without inventing them", () => {
    const coll = [
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Mountain", quantity: 60 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Test",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        { name: "Lightning Bolt", quantity: 4 },
        ...Array.from({ length: 56 }, () => ({
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
      undefined,
      { mustIncludeCards: ["Black Lotus"] },
    );
    expect(trimmed.mainboard.some((l) => l.name === "Black Lotus")).toBe(false);
    expect(adjustments.some((a) => a.includes("Could not include"))).toBe(true);
  });

  it("clamps lands DOWN to the user's explicit target when AI ships too many", () => {
    const spellCards = Array.from({ length: 12 }, (_, i) =>
      mockCard({ name: `Spell ${i}`, color_identity: ["R"] }),
    );
    const coll = [
      ...spellCards.map((c) => resolved({ name: c.name, quantity: 4 }, c)),
      resolved({ name: "Mountain", quantity: 60 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Land-heavy",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        ...spellCards.map((c) => ({ name: c.name, quantity: 2 })),
        { name: "Mountain", quantity: 36 },
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      coll,
      undefined,
      undefined,
      { landsTarget: 24 },
    );
    const lands = trimmed.mainboard
      .filter((l) => l.name === "Mountain")
      .reduce((s, l) => s + l.quantity, 0);
    expect(lands).toBe(24);
    expect(adjustments.some((a) => /24-land target/.test(a))).toBe(true);
  });

  it("clamps lands down even when AI ships mostly non-basic lands", () => {
    const spellCards = Array.from({ length: 12 }, (_, i) =>
      mockCard({ name: `Spell ${i}`, color_identity: ["R"] }),
    );
    const dualCards = Array.from({ length: 10 }, (_, i) =>
      mockCard({
        name: `Fancy Land ${i}`,
        type_line: "Land",
        color_identity: ["R"],
      }),
    );
    const coll = [
      ...spellCards.map((c) => resolved({ name: c.name, quantity: 4 }, c)),
      ...dualCards.map((c) => resolved({ name: c.name, quantity: 4 }, c)),
      resolved({ name: "Mountain", quantity: 60 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Land-heavy duals",
      description: "d",
      format: "modern",
      commander: null,
      mainboard: [
        ...spellCards.map((c) => ({ name: c.name, quantity: 2 })),
        // 30 non-basics + 6 basics = 36 lands, way over target.
        ...dualCards.map((c) => ({ name: c.name, quantity: 3 })),
        { name: "Mountain", quantity: 6 },
      ],
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed } = trimDeckToCollection(
      deck,
      coll,
      undefined,
      undefined,
      { landsTarget: 24 },
    );
    const lands = trimmed.mainboard
      .filter(
        (l) =>
          l.name === "Mountain" || l.name.startsWith("Fancy Land "),
      )
      .reduce((s, l) => s + l.quantity, 0);
    expect(lands).toBe(24);
  });

  it("honors a user-chosen commander even when the AI picked a different one", () => {
    const krenko = mockCard({
      name: "Krenko, Mob Boss",
      type_line: "Legendary Creature — Goblin Warrior",
      color_identity: ["R"],
    });
    const purphoros = mockCard({
      name: "Purphoros, God of the Forge",
      type_line: "Legendary Enchantment Creature — God",
      color_identity: ["R"],
    });
    const goblin = mockCard({
      name: "Goblin Guide",
      type_line: "Creature — Goblin Scout",
      color_identity: ["R"],
    });
    const coll = [
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Purphoros, God of the Forge", quantity: 1 }, purphoros),
      resolved({ name: "Goblin Guide", quantity: 1 }, goblin),
      resolved({ name: "Sol Ring", quantity: 1 }, solRing),
      resolved({ name: "Mountain", quantity: 100 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Goblin Tribal",
      description: "d",
      format: "commander",
      commander: "Purphoros, God of the Forge",
      commanderReason: "Free damage on each goblin ETB.",
      mainboard: [
        { name: "Goblin Guide", quantity: 1 },
        { name: "Sol Ring", quantity: 1 },
        ...Array.from({ length: 97 }, () => ({
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
      undefined,
      { chosenCommander: "Krenko, Mob Boss" },
    );
    expect(trimmed.commander).toBe("Krenko, Mob Boss");
    expect(
      adjustments.some((a) => a.includes("user-chosen commander Krenko")),
    ).toBe(true);
  });

  it("locks deck color identity to the chosen commander, dropping off-color cards", () => {
    const krenko = mockCard({
      name: "Krenko, Mob Boss",
      type_line: "Legendary Creature — Goblin Warrior",
      color_identity: ["R"],
    });
    const blueSpell = mockCard({
      name: "Counterspell",
      type_line: "Instant",
      color_identity: ["U"],
    });
    const redSpell = mockCard({
      name: "Lightning Bolt",
      type_line: "Instant",
      color_identity: ["R"],
    });
    const coll = [
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Counterspell", quantity: 1 }, blueSpell),
      resolved({ name: "Lightning Bolt", quantity: 1 }, redSpell),
      resolved({ name: "Mountain", quantity: 100 }, mountain),
    ];
    // AI returned a different commander (Counterspell shouldn't even be legal,
    // but we want to prove trim re-locks identity to the chosen commander).
    const deck: BuiltDeck = {
      name: "Mistaken Build",
      description: "d",
      format: "commander",
      commander: null,
      mainboard: [
        { name: "Counterspell", quantity: 1 },
        { name: "Lightning Bolt", quantity: 1 },
        ...Array.from({ length: 97 }, () => ({
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
      undefined,
      { chosenCommander: "Krenko, Mob Boss" },
    );
    expect(trimmed.commander).toBe("Krenko, Mob Boss");
    expect(trimmed.mainboard.some((l) => l.name === "Counterspell")).toBe(
      false,
    );
    expect(trimmed.mainboard.some((l) => l.name === "Lightning Bolt")).toBe(
      true,
    );
    expect(
      adjustments.some((a) =>
        a.includes("outside commander color identity"),
      ),
    ).toBe(true);
  });

  it("flags but does not drop a chosen commander that violates other prefs", () => {
    const krenko = mockCard({
      name: "Krenko, Mob Boss",
      type_line: "Legendary Creature — Goblin Warrior",
      color_identity: ["R"],
    });
    const coll = [
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Mountain", quantity: 100 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Goblins",
      description: "d",
      format: "commander",
      commander: "Krenko, Mob Boss",
      mainboard: Array.from({ length: 99 }, () => ({
        name: "Mountain",
        quantity: 1,
      })),
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      coll,
      undefined,
      undefined,
      {
        chosenCommander: "Krenko, Mob Boss",
        avoidCards: ["Krenko, Mob Boss"],
      },
    );
    expect(trimmed.commander).toBe("Krenko, Mob Boss");
    expect(
      adjustments.some((a) =>
        a.includes("User-chosen commander Krenko, Mob Boss is also on the ban list"),
      ),
    ).toBe(true);
  });

  it("falls back to the AI's commander when the chosen one is not in the collection", () => {
    const krenko = mockCard({
      name: "Krenko, Mob Boss",
      type_line: "Legendary Creature — Goblin Warrior",
      color_identity: ["R"],
    });
    const coll = [
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Mountain", quantity: 100 }, mountain),
    ];
    const deck: BuiltDeck = {
      name: "Goblins",
      description: "d",
      format: "commander",
      commander: "Krenko, Mob Boss",
      commanderReason: "AI rationale",
      mainboard: Array.from({ length: 99 }, () => ({
        name: "Mountain",
        quantity: 1,
      })),
      sideboard: [],
      strategy: "s",
      warnings: [],
    };
    const { deck: trimmed, adjustments } = trimDeckToCollection(
      deck,
      coll,
      undefined,
      undefined,
      { chosenCommander: "Atraxa, Praetors' Voice" },
    );
    expect(trimmed.commander).toBe("Krenko, Mob Boss");
    expect(trimmed.commanderReason).toBe("AI rationale");
    expect(
      adjustments.some((a) =>
        a.includes("User-chosen commander \"Atraxa, Praetors' Voice\" was not found"),
      ),
    ).toBe(true);
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
