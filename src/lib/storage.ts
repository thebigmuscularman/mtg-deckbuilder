import type {
  GameLength,
  HouseRules,
  InteractionDensity,
} from "./deck-preferences";
import type { PowerLevelId } from "./power-levels";
import type { BuiltDeck, FormatId, ResolvedCollectionCard } from "./types";

const COLLECTION_KEY = "mtg-deckbuilder:collection";
const PREFS_KEY = "mtg-deckbuilder:prefs";
const DECKS_KEY = "mtg-deckbuilder:decks";
const PRESETS_KEY = "mtg-deckbuilder:presets";
const MAX_DECKS = 8;
const MAX_PRESETS = 12;

export type SavedCollection = {
  resolved: ResolvedCollectionCard[];
  summary: { total: number; unique: number; unresolved: number };
  savedAt: string;
};

export type UserPrefs = {
  format: FormatId;
  colors: string[];
  strategy: string;
  budgetMax: number;
  theme: "dark" | "light";
  powerLevel: PowerLevelId;
  avoidList?: string;
  houseRules?: HouseRules;
  politicsFriendly?: boolean;
  allowIllegal?: boolean;
  interactionDensity?: InteractionDensity;
  gameLength?: GameLength;
  landsTarget?: number;
};

export type PlaygroupPreset = {
  id: string;
  name: string;
  prefs: Partial<UserPrefs>;
};

export type SavedDeckEntry = {
  id: string;
  savedAt: string;
  deck: BuiltDeck;
  label: string;
};

export function loadCollection(): SavedCollection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COLLECTION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedCollection;
  } catch {
    return null;
  }
}

export function saveCollection(data: SavedCollection): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — ignore
  }
}

export function clearCollection(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(COLLECTION_KEY);
  } catch {
    // ignore
  }
}

export function loadPrefs(): Partial<UserPrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<UserPrefs>;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: Partial<UserPrefs>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function loadDeckHistory(): SavedDeckEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(DECKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedDeckEntry[];
  } catch {
    return [];
  }
}

export function pushDeckHistory(deck: BuiltDeck): SavedDeckEntry[] {
  // `${Date.now()}` collides when several decks are pushed in the same tick
  // (e.g. buildThreeDecks awaits Promise.all). Add a random suffix so each
  // entry is uniquely identified and React keys don't duplicate.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedDeckEntry = {
    id,
    savedAt: new Date().toISOString(),
    deck,
    label: deck.name,
  };
  const prev = loadDeckHistory().filter((d) => d.deck.name !== deck.name);
  const next = [entry, ...prev].slice(0, MAX_DECKS);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(DECKS_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  }
  return next;
}

export function loadPlaygroupPresets(): PlaygroupPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PlaygroupPreset[];
  } catch {
    return [];
  }
}

export function savePlaygroupPresets(presets: PlaygroupPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      PRESETS_KEY,
      JSON.stringify(presets.slice(0, MAX_PRESETS)),
    );
  } catch {
    // ignore
  }
}

export function clearStoredData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(COLLECTION_KEY);
  localStorage.removeItem(PREFS_KEY);
  localStorage.removeItem(DECKS_KEY);
  localStorage.removeItem(PRESETS_KEY);
}
