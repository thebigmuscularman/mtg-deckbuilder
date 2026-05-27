import { z } from "zod";
import {
  DEFAULT_HOUSE_RULES,
  parseAvoidList,
  type DeckBuildPreferences,
  type HouseRules,
} from "./deck-preferences";
import type { PowerLevelId } from "./power-levels";

export const houseRulesSchema = z.object({
  noMassLandDestruction: z.boolean().optional(),
  noInfiniteCombos: z.boolean().optional(),
  noExtraTurns: z.boolean().optional(),
});

export const brewPreferencesFields = {
  powerLevel: z.enum(["casual", "focused", "optimized", "high"]).optional(),
  avoidList: z.string().optional(),
  houseRules: houseRulesSchema.optional(),
  politicsFriendly: z.boolean().optional(),
};

export function brewPreferencesFromBody(body: {
  powerLevel?: PowerLevelId;
  avoidList?: string;
  houseRules?: Partial<HouseRules>;
  politicsFriendly?: boolean;
}): DeckBuildPreferences {
  const rules = body.houseRules ?? {};
  return {
    powerLevel: body.powerLevel,
    avoidCards: body.avoidList ? parseAvoidList(body.avoidList) : undefined,
    houseRules: {
      noMassLandDestruction:
        rules.noMassLandDestruction ?? DEFAULT_HOUSE_RULES.noMassLandDestruction,
      noInfiniteCombos:
        rules.noInfiniteCombos ?? DEFAULT_HOUSE_RULES.noInfiniteCombos,
      noExtraTurns: rules.noExtraTurns ?? DEFAULT_HOUSE_RULES.noExtraTurns,
    },
    politicsFriendly: body.politicsFriendly ?? false,
  };
}
