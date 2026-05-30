import { describe, expect, it } from "vitest";
import {
  getCommanderCandidates,
  isLegalCommander,
} from "./commander-candidates";
import { mockCard, resolved } from "./test-helpers";

describe("isLegalCommander", () => {
  it("accepts legendary creatures", () => {
    const card = mockCard({
      name: "Atraxa, Praetors' Voice",
      type_line: "Legendary Creature — Phyrexian Angel Horror",
    });
    expect(isLegalCommander(card)).toBe(true);
  });

  it("accepts planeswalkers whose oracle text grants commander status", () => {
    const card = mockCard({
      name: "Commodore Guff",
      type_line: "Legendary Planeswalker — Guff",
      oracle_text:
        "Commodore Guff can be your commander.\n+1: You get an emblem...",
    });
    expect(isLegalCommander(card)).toBe(true);
  });

  it("accepts cards on a DFC front face that's a legendary creature", () => {
    const card = mockCard({
      name: "Brisela, Voice of Nightmares",
      type_line: "Legendary Creature — Eldrazi Angel",
      card_faces: [
        {
          name: "Brisela, Voice of Nightmares",
          type_line: "Legendary Creature — Eldrazi Angel",
        },
        {
          name: "Bruna, the Fading Light",
          type_line: "Legendary Creature — Angel Horror",
        },
      ],
    });
    expect(isLegalCommander(card)).toBe(true);
  });

  it("rejects non-legendary creatures", () => {
    const card = mockCard({
      name: "Llanowar Elves",
      type_line: "Creature — Elf Druid",
    });
    expect(isLegalCommander(card)).toBe(false);
  });

  it("rejects legendary non-creatures without the clause", () => {
    const card = mockCard({
      name: "Sol Ring",
      type_line: "Legendary Artifact",
    });
    expect(isLegalCommander(card)).toBe(false);
  });
});

describe("getCommanderCandidates", () => {
  const atraxa = mockCard({
    name: "Atraxa, Praetors' Voice",
    type_line: "Legendary Creature — Phyrexian Angel Horror",
    color_identity: ["W", "U", "B", "G"],
  });
  const krenko = mockCard({
    name: "Krenko, Mob Boss",
    type_line: "Legendary Creature — Goblin Warrior",
    color_identity: ["R"],
  });
  const bolt = mockCard({
    name: "Lightning Bolt",
    type_line: "Instant",
  });
  const sol = mockCard({
    name: "Sol Ring",
    type_line: "Legendary Artifact",
  });
  const commodore = mockCard({
    name: "Commodore Guff",
    type_line: "Legendary Planeswalker — Guff",
    oracle_text: "Commodore Guff can be your commander.",
    color_identity: ["U", "R", "W"],
  });

  it("returns only commander-eligible cards, alphabetized", () => {
    const collection = [
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Sol Ring", quantity: 1 }, sol),
      resolved({ name: "Atraxa, Praetors' Voice", quantity: 1 }, atraxa),
      resolved({ name: "Commodore Guff", quantity: 1 }, commodore),
    ];
    const candidates = getCommanderCandidates(collection);
    expect(candidates.map((c) => c.name)).toEqual([
      "Atraxa, Praetors' Voice",
      "Commodore Guff",
      "Krenko, Mob Boss",
    ]);
  });

  it("returns an empty list when no commanders are present", () => {
    const candidates = getCommanderCandidates([
      resolved({ name: "Lightning Bolt", quantity: 4 }, bolt),
      resolved({ name: "Sol Ring", quantity: 1 }, sol),
    ]);
    expect(candidates).toEqual([]);
  });

  it("collapses duplicate printings", () => {
    const candidates = getCommanderCandidates([
      resolved({ name: "Krenko, Mob Boss", quantity: 1 }, krenko),
      resolved({ name: "Krenko, Mob Boss", quantity: 1, set: "abc" }, krenko),
    ]);
    expect(candidates.length).toBe(1);
  });

  it("ignores unresolved entries", () => {
    const candidates = getCommanderCandidates([
      resolved({ name: "Mystery Card", quantity: 1 }, null),
      resolved({ name: "Atraxa, Praetors' Voice", quantity: 1 }, atraxa),
    ]);
    expect(candidates.map((c) => c.name)).toEqual([
      "Atraxa, Praetors' Voice",
    ]);
  });
});
