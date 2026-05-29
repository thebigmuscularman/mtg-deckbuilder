import { z } from "zod";
import {
  DEFAULT_HOUSE_RULES,
  parseAvoidList,
  type DeckBuildPreferences,
  type GameLength,
  type HouseRules,
  type InteractionDensity,
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
  mustIncludeList: z.string().optional(),
  houseRules: houseRulesSchema.optional(),
  politicsFriendly: z.boolean().optional(),
  allowIllegal: z.boolean().optional(),
  interactionDensity: z.enum(["light", "balanced", "heavy"]).optional(),
  gameLength: z.enum(["fast", "balanced", "grindy"]).optional(),
  landsTarget: z.number().int().min(18).max(45).optional(),
  chosenCommander: z.string().min(1).max(200).optional(),
};

export function brewPreferencesFromBody(body: {
  powerLevel?: PowerLevelId;
  avoidList?: string;
  mustIncludeList?: string;
  houseRules?: Partial<HouseRules>;
  politicsFriendly?: boolean;
  allowIllegal?: boolean;
  interactionDensity?: InteractionDensity;
  gameLength?: GameLength;
  landsTarget?: number;
  chosenCommander?: string;
}): DeckBuildPreferences {
  const rules = body.houseRules ?? {};
  return {
    powerLevel: body.powerLevel,
    avoidCards: body.avoidList ? parseAvoidList(body.avoidList) : undefined,
    mustIncludeCards: body.mustIncludeList
      ? parseAvoidList(body.mustIncludeList)
      : undefined,
    houseRules: {
      noMassLandDestruction:
        rules.noMassLandDestruction ?? DEFAULT_HOUSE_RULES.noMassLandDestruction,
      noInfiniteCombos:
        rules.noInfiniteCombos ?? DEFAULT_HOUSE_RULES.noInfiniteCombos,
      noExtraTurns: rules.noExtraTurns ?? DEFAULT_HOUSE_RULES.noExtraTurns,
    },
    politicsFriendly: body.politicsFriendly ?? false,
    allowIllegal: body.allowIllegal ?? false,
    interactionDensity: body.interactionDensity,
    gameLength: body.gameLength,
    landsTarget: body.landsTarget,
    chosenCommander: body.chosenCommander?.trim() || undefined,
  };
}
