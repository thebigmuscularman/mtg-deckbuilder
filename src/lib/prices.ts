import type { ScryfallCard } from "./types";
import { getDisplayName } from "./scryfall";

export function cardUsdPrice(card: ScryfallCard): number {
  const raw = card.prices?.usd ?? card.prices?.usd_foil ?? null;
  if (!raw) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

export function lineUsdPrice(card: ScryfallCard | null, quantity: number): number {
  if (!card) return 0;
  return cardUsdPrice(card) * quantity;
}

export function formatUsd(amount: number): string {
  if (amount >= 100) return `$${amount.toFixed(0)}`;
  if (amount >= 10) return `$${amount.toFixed(1)}`;
  return `$${amount.toFixed(2)}`;
}

export function collectionEstimatedValue(
  items: Array<{ card: ScryfallCard | null; quantity: number }>,
): number {
  let total = 0;
  for (const { card, quantity } of items) {
    if (!card) continue;
    total += cardUsdPrice(card) * quantity;
  }
  return total;
}

export function deckEstimatedValue(
  lines: Array<{ card: ScryfallCard | null; quantity: number }>,
  commander: ScryfallCard | null,
): number {
  let total = collectionEstimatedValue(lines);
  if (commander) total += cardUsdPrice(commander);
  return total;
}

export function cardWithinBudget(card: ScryfallCard, maxUsd: number): boolean {
  if (maxUsd <= 0) return true;
  return cardUsdPrice(card) <= maxUsd;
}

export function filterCollectionByBudget<T extends { card: ScryfallCard | null }>(
  items: T[],
  maxUsd: number,
): T[] {
  if (maxUsd <= 0) return items;
  return items.filter((item) => !item.card || cardWithinBudget(item.card, maxUsd));
}

export function summarizePrices(cards: ScryfallCard[]): {
  priced: number;
  missing: number;
  total: number;
} {
  let priced = 0;
  let missing = 0;
  let total = 0;
  const seen = new Set<string>();
  for (const card of cards) {
    const key = getDisplayName(card).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const p = cardUsdPrice(card);
    if (p > 0) {
      priced++;
      total += p;
    } else {
      missing++;
    }
  }
  return { priced, missing, total };
}
