import type { FormatId, ScryfallCard } from "./types";
import { getDisplayName, isLegendary } from "./scryfall";

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
  return BASIC_LAND_NAMES.has(name.toLowerCase());
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

export function getCommanderCandidates(cards: ScryfallCard[]): ScryfallCard[] {
  return cards.filter((card) => {
    const typeLine = card.type_line ?? "";
    return (
      isLegendary(card) &&
      (typeLine.toLowerCase().includes("creature") ||
        typeLine.toLowerCase().includes("planeswalker"))
    );
  });
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
- Only Commander-legal cards`;
  }
  return `Format: ${f.label}
- Main deck: exactly ${f.minMainboard} cards
- Up to 4 copies per non-basic-land card
- Sideboard: optional, up to ${f.maxSideboard} cards
- Only ${f.label}-legal cards per Scryfall legality`;
}
