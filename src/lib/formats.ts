import type { FormatId, ScryfallCard } from "./types";
import { getDisplayName, nameKey } from "./scryfall";

export interface FormatRules {
  id: FormatId;
  label: string;
  description: string;
  minMainboard: number;
  maxMainboard: number;
  maxCopies: (card: ScryfallCard) => number;
  sideboardAllowed: boolean;
  maxSideboard: number;
  requiresCommander: boolean;
  scryfallLegalityKey: string;
}

const BASIC_LAND_NAMES = new Set([
  "plains",
  "island",
  "swamp",
  "mountain",
  "forest",
  "wastes",
  "snow-covered plains",
  "snow-covered island",
  "snow-covered swamp",
  "snow-covered mountain",
  "snow-covered forest",
]);

export function isBasicLand(name: string): boolean {
  return BASIC_LAND_NAMES.has(nameKey(name));
}

export const FORMATS: Record<FormatId, FormatRules> = {
  standard: {
    id: "standard",
    label: "Standard",
    description: "60+ cards, up to 4 copies, Standard-legal only",
    minMainboard: 60,
    maxMainboard: 60,
    maxCopies: (card) => (isBasicLand(getDisplayName(card)) ? 99 : 4),
    sideboardAllowed: true,
    maxSideboard: 15,
    requiresCommander: false,
    scryfallLegalityKey: "standard",
  },
  modern: {
    id: "modern",
    label: "Modern",
    description: "60+ cards, up to 4 copies, Modern-legal only",
    minMainboard: 60,
    maxMainboard: 60,
    maxCopies: (card) => (isBasicLand(getDisplayName(card)) ? 99 : 4),
    sideboardAllowed: true,
    maxSideboard: 15,
    requiresCommander: false,
    scryfallLegalityKey: "modern",
  },
  pioneer: {
    id: "pioneer",
    label: "Pioneer",
    description: "60+ cards, up to 4 copies, Pioneer-legal only",
    minMainboard: 60,
    maxMainboard: 60,
    maxCopies: (card) => (isBasicLand(getDisplayName(card)) ? 99 : 4),
    sideboardAllowed: true,
    maxSideboard: 15,
    requiresCommander: false,
    scryfallLegalityKey: "pioneer",
  },
  pauper: {
    id: "pauper",
    label: "Pauper",
    description: "60+ cards, commons only (Scryfall rarity), up to 4 copies",
    minMainboard: 60,
    maxMainboard: 60,
    maxCopies: (card) => (isBasicLand(getDisplayName(card)) ? 99 : 4),
    sideboardAllowed: true,
    maxSideboard: 15,
    requiresCommander: false,
    scryfallLegalityKey: "pauper",
  },
  commander: {
    id: "commander",
    label: "Commander",
    description: "100-card singleton (except basics), legendary commander",
    minMainboard: 99,
    maxMainboard: 99,
    maxCopies: (card) => (isBasicLand(getDisplayName(card)) ? 99 : 1),
    sideboardAllowed: false,
    maxSideboard: 0,
    requiresCommander: true,
    scryfallLegalityKey: "commander",
  },
};

export function getFormat(id: FormatId): FormatRules {
  return FORMATS[id];
}

export function cardMeetsColorIdentity(
  card: ScryfallCard,
  commanderColors: string[],
): boolean {
  if (!commanderColors.length) return true;
  const identity = card.color_identity ?? [];
  return identity.every((c) => commanderColors.includes(c));
}

export function formatRulesPrompt(formatId: FormatId): string {
  const f = getFormat(formatId);
  if (formatId === "commander") {
    return `Format: Commander (EDH)
- Exactly 100 cards total: 1 commander + 99 other cards in the main "deck"
- Singleton: max 1 copy of each non-basic card
- Unlimited basic lands
- Commander must be a legendary creature (or planeswalker with "can be your commander") from the collection
- Every card's color identity must be a subset of the commander's color identity
- Only Commander-legal cards
- LAND COUNT: include AT LEAST 35 lands (and typically 36–38). A Commander deck with fewer than 33 lands will not function — you MUST count lands before submitting. Use a mix of nonbasics from the collection plus basic lands to hit this. Basics are unlimited, so always pad with basics if non-basics are scarce.`;
  }
  return `Format: ${f.label}
- Main deck: exactly ${f.minMainboard} cards
- Up to 4 copies per non-basic-land card
- Sideboard: optional, up to ${f.maxSideboard} cards
- Only ${f.label}-legal cards per Scryfall legality
- LAND COUNT: include AT LEAST 22 lands (typically 23–25 in 60-card formats). Aggro can run 20, control can run 26+. A 60-card deck with under 20 lands will mulligan to oblivion. You MUST count lands before submitting. Pad with owned basic lands if non-basic options are scarce — basics are always allowed in unlimited quantity.`;
}
