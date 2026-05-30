import { getDisplayName } from "./scryfall";
import type { ResolvedCollectionCard, ScryfallCard } from "./types";

function combinedTypeLine(card: ScryfallCard): string {
  const main = card.type_line ?? "";
  const front = card.card_faces?.[0]?.type_line ?? "";
  return `${main}\n${front}`;
}

function combinedOracleText(card: ScryfallCard): string {
  const main = card.oracle_text ?? "";
  const front = card.card_faces?.[0]?.oracle_text ?? "";
  return `${main}\n${front}`;
}

/**
 * A card is a legal commander if it is a Legendary Creature, OR if its oracle
 * text explicitly says it may be the commander (covers planeswalker commanders,
 * Background commanders, and the few non-creature legendaries with the clause).
 */
export function isLegalCommander(card: ScryfallCard): boolean {
  const typeLine = combinedTypeLine(card);
  if (/legendary[^\n]*creature/i.test(typeLine)) return true;
  const oracle = combinedOracleText(card);
  if (/can be your commander/i.test(oracle)) return true;
  return false;
}

export type CommanderCandidate = {
  name: string;
  card: ScryfallCard;
};

/**
 * Surface every commander-eligible card from the resolved collection, sorted
 * alphabetically by display name. Duplicate printings are collapsed.
 */
export function getCommanderCandidates(
  resolved: ResolvedCollectionCard[],
): CommanderCandidate[] {
  const seen = new Set<string>();
  const result: CommanderCandidate[] = [];
  for (const item of resolved) {
    if (!item.card) continue;
    if (!isLegalCommander(item.card)) continue;
    const display = getDisplayName(item.card);
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ name: display, card: item.card });
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
