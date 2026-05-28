import { collectionToPromptList } from "../collection";
import { getFormat, isBasicLand } from "../formats";
import { buildOwnedIndex } from "../deck-validation";
import type { FormatId, ResolvedCollectionCard, ScryfallCard } from "../types";
import { getDisplayName } from "../scryfall";
import { colorTag, sortWubrg } from "./color-utils";

type PromptCard = {
  name: string;
  quantity: number;
  typeLine: string;
  identity: string[];
  cmc: number;
  manaCost?: string;
  oracleText?: string;
  keywords?: string[];
  power?: string;
  toughness?: string;
  rarity?: string;
  card: ScryfallCard;
};

function gatherPromptCards(
  resolved: ResolvedCollectionCard[],
  format: FormatId,
): PromptCard[] {
  // De-dupe by Scryfall card id (different printings of the same card share an id).
  const owned = buildOwnedIndex(resolved);
  const seen = new Set<string>();
  const formatRules = getFormat(format);
  const out: PromptCard[] = [];
  for (const entry of owned.values()) {
    if (seen.has(entry.card.id)) continue;
    seen.add(entry.card.id);
    const name = getDisplayName(entry.card);
    const formatMax = isBasicLand(name) ? 99 : formatRules.maxCopies(entry.card);
    const card = entry.card;
    out.push({
      name,
      quantity: Math.min(entry.qty, formatMax),
      typeLine: card.type_line,
      identity: sortWubrg(card.color_identity ?? []),
      cmc: Math.max(0, card.cmc ?? 0),
      manaCost: card.mana_cost,
      oracleText: card.oracle_text ?? card.card_faces?.[0]?.oracle_text,
      keywords: card.keywords,
      power: card.power,
      toughness: card.toughness,
      rarity: card.rarity,
      card,
    });
  }
  return out;
}

export function buildCollectionContext(
  resolved: ResolvedCollectionCard[],
  format: FormatId,
  prefColors: string[] = [],
): string {
  const cards = gatherPromptCards(resolved, format);
  const filtered =
    prefColors.length > 0
      ? cards.filter((c) => c.identity.every((x) => prefColors.includes(x)))
      : cards;

  if (prefColors.length >= 2) {
    const multi = filtered.filter((c) => c.identity.length >= 2);
    const mono = filtered.filter((c) => c.identity.length === 1);
    const colorless = filtered.filter((c) => c.identity.length === 0);
    const lines: string[] = [];

    const toPromptEntry = (c: PromptCard, colorOverride?: string) => ({
      name: c.name,
      quantity: c.quantity,
      typeLine: c.typeLine,
      colors: [colorOverride ?? colorTag(c.identity)],
      cmc: c.cmc,
      manaCost: c.manaCost,
      oracleText: c.oracleText,
      keywords: c.keywords,
      power: c.power,
      toughness: c.toughness,
      rarity: c.rarity,
    });

    if (multi.length) {
      lines.push(
        `=== MULTICOLOR SIGNATURE CARDS (${multi.length}) — HIGH PRIORITY, prefer these heavily; they pay off your color commitment ===`,
      );
      lines.push(collectionToPromptList(multi.map((c) => toPromptEntry(c))));
    }
    if (mono.length) {
      lines.push(`\n=== MONO-COLOR CARDS (${mono.length}) ===`);
      lines.push(collectionToPromptList(mono.map((c) => toPromptEntry(c))));
    }
    if (colorless.length) {
      lines.push(`\n=== COLORLESS / ARTIFACTS (${colorless.length}) ===`);
      lines.push(
        collectionToPromptList(colorless.map((c) => toPromptEntry(c, "C"))),
      );
    }
    return lines.join("\n");
  }

  return collectionToPromptList(
    filtered.map((c) => ({
      name: c.name,
      quantity: c.quantity,
      typeLine: c.typeLine,
      colors: [colorTag(c.identity)],
      cmc: c.cmc,
      manaCost: c.manaCost,
      oracleText: c.oracleText,
      keywords: c.keywords,
      power: c.power,
      toughness: c.toughness,
      rarity: c.rarity,
    })),
  );
}

export function buildColorInventory(resolved: ResolvedCollectionCard[]): string {
  const counts = new Map<string, number>();
  for (const r of resolved) {
    if (!r.card) continue;
    const key = colorTag(r.card.color_identity ?? []);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return rows.map(([k, n]) => `  [${k}] ${n} unique cards`).join("\n");
}