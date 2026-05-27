"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_HOUSE_RULES,
  type GameLength,
  type HouseRules,
  type InteractionDensity,
} from "@/lib/deck-preferences";
import {
  DEFAULT_POWER_LEVEL,
  isPowerLevelId,
  type PowerLevelId,
} from "@/lib/power-levels";
import { loadPrefs, savePrefs, type UserPrefs } from "@/lib/storage";
import type { FormatId } from "@/lib/types";
import type { Color } from "./types";

export type DeckPrefs = {
  format: FormatId;
  colors: Color[];
  strategy: string;
  budgetMax: number;
  powerLevel: PowerLevelId;
  avoidList: string;
  houseRules: HouseRules;
  politicsFriendly: boolean;
  allowIllegal: boolean;
  interactionDensity: InteractionDensity;
  gameLength: GameLength;
  landsTarget: number;
  theme: "dark" | "light";
};

export type DeckPrefsApi = DeckPrefs & {
  setFormat: (f: FormatId) => void;
  setColors: React.Dispatch<React.SetStateAction<Color[]>>;
  setStrategy: (s: string) => void;
  setBudgetMax: (n: number) => void;
  setPowerLevel: (p: PowerLevelId) => void;
  setAvoidList: (s: string) => void;
  setHouseRules: React.Dispatch<React.SetStateAction<HouseRules>>;
  setPoliticsFriendly: (b: boolean) => void;
  setAllowIllegal: (b: boolean) => void;
  setInteractionDensity: (v: InteractionDensity) => void;
  setGameLength: (v: GameLength) => void;
  setLandsTarget: (n: number) => void;
  setTheme: React.Dispatch<React.SetStateAction<"dark" | "light">>;
  applyPreset: (prefs: Partial<UserPrefs>) => void;
  hydrated: boolean;
};

const DEFAULTS: DeckPrefs = {
  format: "modern",
  colors: [],
  strategy: "",
  budgetMax: 0,
  powerLevel: DEFAULT_POWER_LEVEL,
  avoidList: "",
  houseRules: DEFAULT_HOUSE_RULES,
  politicsFriendly: false,
  allowIllegal: false,
  interactionDensity: "balanced",
  gameLength: "balanced",
  landsTarget: 0,
  theme: "dark",
};

export function useDeckPrefs(): DeckPrefsApi {
  const [hydrated, setHydrated] = useState(false);
  const [format, setFormat] = useState<FormatId>(DEFAULTS.format);
  const [colors, setColors] = useState<Color[]>(DEFAULTS.colors);
  const [strategy, setStrategy] = useState(DEFAULTS.strategy);
  const [budgetMax, setBudgetMax] = useState(DEFAULTS.budgetMax);
  const [powerLevel, setPowerLevel] = useState<PowerLevelId>(DEFAULTS.powerLevel);
  const [avoidList, setAvoidList] = useState(DEFAULTS.avoidList);
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULTS.houseRules);
  const [politicsFriendly, setPoliticsFriendly] = useState(
    DEFAULTS.politicsFriendly,
  );
  const [allowIllegal, setAllowIllegal] = useState(DEFAULTS.allowIllegal);
  const [interactionDensity, setInteractionDensity] =
    useState<InteractionDensity>(DEFAULTS.interactionDensity);
  const [gameLength, setGameLength] = useState<GameLength>(DEFAULTS.gameLength);
  const [landsTarget, setLandsTarget] = useState(DEFAULTS.landsTarget);
  const [theme, setTheme] = useState<"dark" | "light">(DEFAULTS.theme);

  // Only the UI theme persists across sessions. Deck-build form values
  // (format, colors, strategy, power level, etc.) start fresh every page
  // load — users found it confusing to land on the Brew step pre-filled
  // from a previous build. Use "Save playgroup preset" to opt into
  // recallable settings.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore theme from localStorage */
    const p = loadPrefs();
    if (p.theme) setTheme(p.theme);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    savePrefs({ theme });
  }, [hydrated, theme]);

  const applyPreset = useCallback((p: Partial<UserPrefs>) => {
    if (p.allowIllegal !== undefined) setAllowIllegal(p.allowIllegal);
    if (p.interactionDensity) setInteractionDensity(p.interactionDensity);
    if (p.gameLength) setGameLength(p.gameLength);
    if (p.landsTarget) setLandsTarget(p.landsTarget);
    if (p.powerLevel && isPowerLevelId(p.powerLevel)) setPowerLevel(p.powerLevel);
    if (p.avoidList !== undefined) setAvoidList(p.avoidList);
    if (p.houseRules) setHouseRules(p.houseRules);
    if (p.politicsFriendly !== undefined) setPoliticsFriendly(p.politicsFriendly);
  }, []);

  return {
    format,
    colors,
    strategy,
    budgetMax,
    powerLevel,
    avoidList,
    houseRules,
    politicsFriendly,
    allowIllegal,
    interactionDensity,
    gameLength,
    landsTarget,
    theme,
    setFormat,
    setColors,
    setStrategy,
    setBudgetMax,
    setPowerLevel,
    setAvoidList,
    setHouseRules,
    setPoliticsFriendly,
    setAllowIllegal,
    setInteractionDensity,
    setGameLength,
    setLandsTarget,
    setTheme,
    applyPreset,
    hydrated,
  };
}

export function brewPayload(p: DeckPrefs, resolved: unknown) {
  return {
    format: p.format,
    resolved,
    strategy: p.strategy,
    colors: p.colors,
    budgetMax: p.budgetMax > 0 ? p.budgetMax : undefined,
    powerLevel: p.powerLevel,
    avoidList: p.avoidList.trim() || undefined,
    houseRules: p.houseRules,
    politicsFriendly:
      p.format === "commander" ? p.politicsFriendly : undefined,
    allowIllegal: p.allowIllegal || undefined,
    interactionDensity: p.interactionDensity,
    gameLength: p.gameLength,
    landsTarget: p.landsTarget > 0 ? p.landsTarget : undefined,
  };
}
