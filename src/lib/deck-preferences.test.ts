import { describe, expect, it } from "vitest";
import {
  cardViolatesHouseRules,
  suggestPowerLevelAdjustment,
} from "./deck-preferences";
import { mockCard } from "./test-helpers";

const allRules = {
  noMassLandDestruction: true,
  noInfiniteCombos: true,
  noExtraTurns: true,
};

describe("cardViolatesHouseRules", () => {
  it("blocks exact MLD cards without substring false positives", () => {
    expect(
      cardViolatesHouseRules(mockCard({ name: "Wildfire" }), allRules),
    ).toBe("mass land destruction");
    expect(
      cardViolatesHouseRules(
        mockCard({ name: "Wildfire Devils", type_line: "Creature" }),
        allRules,
      ),
    ).toBeNull();
  });

  it("blocks exact combo pieces", () => {
    expect(
      cardViolatesHouseRules(
        mockCard({ name: "Thassa's Oracle" }),
        allRules,
      ),
    ).toBe("infinite / game-winning combo piece");
  });

  it("does not block Infinite Reflection by name alone", () => {
    expect(
      cardViolatesHouseRules(
        mockCard({
          name: "Infinite Reflection",
          oracle_text: "Enchant creature",
        }),
        allRules,
      ),
    ).toBeNull();
  });

  it("blocks extra-turn cards by exact name", () => {
    expect(
      cardViolatesHouseRules(mockCard({ name: "Time Warp" }), allRules),
    ).toBe("extra turn effect");
  });
});

describe("suggestPowerLevelAdjustment", () => {
  it("suggests lowering power when deck reads high", () => {
    expect(suggestPowerLevelAdjustment("high", "optimized")).toBe("focused");
    expect(suggestPowerLevelAdjustment("high", "casual")).toBeNull();
  });

  it("suggests raising power when deck reads low", () => {
    expect(suggestPowerLevelAdjustment("low", "focused")).toBe("optimized");
    expect(suggestPowerLevelAdjustment("low", "high")).toBeNull();
  });

  it("returns null when on target", () => {
    expect(suggestPowerLevelAdjustment("match", "focused")).toBeNull();
  });
});
