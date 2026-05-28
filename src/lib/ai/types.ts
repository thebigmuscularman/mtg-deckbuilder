import type { BuiltDeck, FormatId, ResolvedCollectionCard } from "../types";
import type { DeckBuildPreferences } from "../deck-preferences";
import type { DeckBuildProgress } from "./progress";

export type BrewArgs = {
  format: FormatId;
  resolved: ResolvedCollectionCard[];
  strategyHint?: string;
  colorPref?: string[];
  maxBudgetUsd?: number;
  onProgress?: (event: DeckBuildProgress) => void;
  brewPrefs?: DeckBuildPreferences;
};

export type DeckResult = { deck: BuiltDeck; validationErrors: string[] };
