export type FormatId = "standard" | "modern" | "commander";

export type LegalityStatus =
  | "legal"
  | "not_legal"
  | "restricted"
  | "banned"
  | "unknown";

export interface CollectionEntry {
  name: string;
  quantity: number;
  set?: string;
  collectorNumber?: string;
}

export interface ScryfallCard {
  id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors: string[];
  color_identity: string[];
  legalities: Record<string, LegalityStatus | undefined>;
  set: string;
  set_name: string;
  rarity: string;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
  };
  card_faces?: Array<{
    name: string;
    mana_cost?: string;
    type_line: string;
    oracle_text?: string;
    image_uris?: {
      small: string;
      normal: string;
      large: string;
    };
  }>;
  keywords?: string[];
  power?: string;
  toughness?: string;
  layout: string;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    eur?: string | null;
  };
}

export interface ResolvedCollectionCard {
  entry: CollectionEntry;
  card: ScryfallCard | null;
  error?: string;
}

export interface DeckCardLine {
  name: string;
  quantity: number;
  scryfallId?: string;
  reason?: string;
}

export interface BuiltDeck {
  name: string;
  description: string;
  format: FormatId;
  commander: string | null;
  commanderReason?: string;
  archetype?: string;
  overview?: string;
  winConditions?: string[];
  strengths?: string[];
  weaknesses?: string[];
  mainboard: DeckCardLine[];
  sideboard: DeckCardLine[];
  strategy: string;
  warnings: string[];
}

export interface CollectionSummary {
  totalEntries: number;
  resolved: ResolvedCollectionCard[];
  unresolved: ResolvedCollectionCard[];
}
