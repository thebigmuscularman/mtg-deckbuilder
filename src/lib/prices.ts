import type { ScryfallCard } from "./types";

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
