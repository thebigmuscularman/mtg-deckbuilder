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
  mustIncludeList?: string;
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

/** Read JSON from localStorage, returning `fallback` on missing/parse error. */
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write JSON to localStorage, silently swallowing quota errors. */
function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — ignore
  }
}

function remove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const loadCollection = (): SavedCollection | null =>
  read<SavedCollection | null>(COLLECTION_KEY, null);

export const saveCollection = (data: SavedCollection): void =>
  write(COLLECTION_KEY, data);

export const clearCollection = (): void => remove(COLLECTION_KEY);

export const loadPrefs = (): Partial<UserPrefs> =>
  read<Partial<UserPrefs>>(PREFS_KEY, {});

export const savePrefs = (prefs: Partial<UserPrefs>): void =>
  write(PREFS_KEY, prefs);

export const loadDeckHistory = (): SavedDeckEntry[] =>
  read<SavedDeckEntry[]>(DECKS_KEY, []);

export function pushDeckHistory(deck: BuiltDeck): SavedDeckEntry[] {
  // `${Date.now()}` collides when several decks are pushed in the same tick
  // (e.g. buildThreeDecks). Random suffix keeps React keys unique.
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: SavedDeckEntry = {
    id,
    savedAt: new Date().toISOString(),
    deck,
    label: deck.name,
  };
  const prev = loadDeckHistory().filter((d) => d.deck.name !== deck.name);
  const next = [entry, ...prev].slice(0, MAX_DECKS);
  write(DECKS_KEY, next);
  return next;
}

export const loadPlaygroupPresets = (): PlaygroupPreset[] =>
  read<PlaygroupPreset[]>(PRESETS_KEY, []);

export const savePlaygroupPresets = (presets: PlaygroupPreset[]): void =>
  write(PRESETS_KEY, presets.slice(0, MAX_PRESETS));
