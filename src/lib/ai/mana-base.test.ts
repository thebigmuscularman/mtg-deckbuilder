import { describe, expect, it } from "vitest";
import { applyAutoManaBase, spellTargetFor, defaultLandsTargetFor } from "./mana-base";
import { buildOwnedIndex } from "../deck-validation";
import { mockCard, resolved } from "../test-helpers";

const bolt = mockCard({
  name: "Lightning Bolt",
  cmc: 1,
  mana_cost: "{R}",
  color_identity: ["R"],
  type_line: "Instant",
});

const counterspell = mockCard({
  name: "Counterspell",
  cmc: 2,
  mana_cost: "{U}{U}",
  color_identity: ["U"],
  type_line: "Instant",
});

const commandTower = mockCard({
  name: "Command Tower",
  cmc: 0,
  type_line: "Land",
  color_identity: [],
});

const reliquaryTower = mockCard({
  name: "Reliquary Tower",
  cmc: 0,
  type_line: "Land",
  color_identity: [],
});

const sacredFoundry = mockCard({
  name: "Sacred Foundry",
  cmc: 0,
  type_line: "Land — Mountain Plains",
  color_identity: ["R", "W"],
});

describe("spellTargetFor / defaultLandsTargetFor", () => {
  it("computes spell target as total minus lands", () => {
    expect(spellTargetFor("commander", 36)).toBe(63);
    expect(spellTargetFor("modern", 23)).toBe(37);
  });

  it("defaults to 36 lands for commander, 23 for 60-card", () => {
    expect(defaultLandsTargetFor("commander")).toBe(36);
    expect(defaultLandsTargetFor("modern")).toBe(23);
  });
});

describe("applyAutoManaBase", () => {
  it("strips lands the AI included and replaces with auto mana base", () => {
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 1 }, bolt),
      resolved({ name: "Sacred Foundry", quantity: 1 }, sacredFoundry),
    ];
    const owned = buildOwnedIndex(collection);
    const aiMainboard = [
      { name: "Lightning Bolt", quantity: 30 },
      { name: "Sacred Foundry", quantity: 4 },
    ];

    const result = applyAutoManaBase(aiMainboard, owned, "commander", {
      landsTarget: 36,
      commanderColors: ["R"],
    });

    expect(result.strippedLandCount).toBe(4);
    const lands = result.mainboard.filter((l) =>
      ["Plains", "Island", "Swamp", "Mountain", "Forest"].includes(l.name),
    );
    const totalLands = lands.reduce((s, l) => s + l.quantity, 0);
    expect(totalLands).toBe(36);
    expect(
      result.mainboard.find((l) => l.name === "Sacred Foundry"),
    ).toBeUndefined();
  });

  it("auto-includes owned utility staples up to ~25% of land count", () => {
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 1 }, bolt),
      resolved({ name: "Command Tower", quantity: 1 }, commandTower),
      resolved({ name: "Reliquary Tower", quantity: 1 }, reliquaryTower),
    ];
    const owned = buildOwnedIndex(collection);
    const aiMainboard = [{ name: "Lightning Bolt", quantity: 1 }];

    const result = applyAutoManaBase(aiMainboard, owned, "commander", {
      landsTarget: 36,
      commanderColors: ["R"],
    });

    expect(result.staplesAdded).toContain("Command Tower");
    expect(result.staplesAdded).toContain("Reliquary Tower");
    const totalLands = result.mainboard
      .filter((l) => {
        const tl = (
          owned.get(l.name.toLowerCase().trim())?.card.type_line ?? ""
        ).toLowerCase();
        return tl.includes("land");
      })
      .reduce((s, l) => s + l.quantity, 0);
    expect(totalLands).toBe(36);
  });

  it("weights basics by mana pip distribution", () => {
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Counterspell", quantity: 1 }, counterspell),
    ];
    const owned = buildOwnedIndex(collection);
    // 4 R pips vs 2 U pips => 2:1 ratio
    const spells = [
      { name: "Lightning Bolt", quantity: 4 },
      { name: "Counterspell", quantity: 1 },
    ];

    const result = applyAutoManaBase(spells, owned, "commander", {
      landsTarget: 30,
      commanderColors: ["R", "U"],
    });

    const mountains =
      result.mainboard.find((l) => l.name === "Mountain")?.quantity ?? 0;
    const islands =
      result.mainboard.find((l) => l.name === "Island")?.quantity ?? 0;
    expect(mountains + islands).toBe(30);
    // 4R+2U = 6 pips total, 4/6 of 30 = 20 mountains, 2/6 of 30 = 10 islands
    expect(mountains).toBe(20);
    expect(islands).toBe(10);
  });

  it("falls back to even split when spells have no colored pips", () => {
    const colorlessRock = mockCard({
      name: "Sol Ring",
      cmc: 1,
      mana_cost: "{1}",
      type_line: "Artifact",
      color_identity: [],
    });
    const collection = [
      resolved({ name: "Sol Ring", quantity: 1 }, colorlessRock),
    ];
    const owned = buildOwnedIndex(collection);
    const spells = [{ name: "Sol Ring", quantity: 1 }];

    const result = applyAutoManaBase(spells, owned, "commander", {
      landsTarget: 30,
      commanderColors: ["R", "G"],
    });

    const mountains =
      result.mainboard.find((l) => l.name === "Mountain")?.quantity ?? 0;
    const forests =
      result.mainboard.find((l) => l.name === "Forest")?.quantity ?? 0;
    expect(mountains).toBe(15);
    expect(forests).toBe(15);
  });

  it("filters utility staples that break commander color identity", () => {
    const bojuka = mockCard({
      name: "Bojuka Bog",
      type_line: "Land",
      color_identity: ["B"],
    });
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 1 }, bolt),
      resolved({ name: "Bojuka Bog", quantity: 1 }, bojuka),
    ];
    const owned = buildOwnedIndex(collection);
    const result = applyAutoManaBase(
      [{ name: "Lightning Bolt", quantity: 1 }],
      owned,
      "commander",
      { landsTarget: 36, commanderColors: ["R"] },
    );
    expect(result.staplesAdded).not.toContain("Bojuka Bog");
  });

  it("does not auto-include staples for non-commander formats", () => {
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Command Tower", quantity: 1 }, commandTower),
    ];
    const owned = buildOwnedIndex(collection);
    const result = applyAutoManaBase(
      [{ name: "Lightning Bolt", quantity: 4 }],
      owned,
      "modern",
      { landsTarget: 23, commanderColors: [], prefColors: ["R"] },
    );
    expect(result.staplesAdded).toEqual([]);
    const totalLands = result.mainboard
      .filter((l) => l.name === "Mountain")
      .reduce((s, l) => s + l.quantity, 0);
    expect(totalLands).toBe(23);
  });
});
