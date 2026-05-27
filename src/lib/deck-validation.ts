import type {
  BuiltDeck,
  DeckCardLine,
  ResolvedCollectionCard,
  ScryfallCard,
} from "./types";
import {
  cardMeetsColorIdentity,
  getFormat,
  isBasicLand,
} from "./formats";
import { getDisplayName, nameKey } from "./scryfall";

export interface OwnedEntry {
  qty: number;
  card: ScryfallCard;
}

/**
 * Single source of truth for "what does the user own and how many".
 *
 * Each unique card (keyed by its canonical display name) gets ONE
 * shared `OwnedEntry` whose `qty` sums every printing the user has.
 * That entry is then indexed under:
 *   - the canonical display name (always), AND
 *   - every collection-entry name the user typed for it (aliases),
 *
 * so anywhere downstream can resolve an AI's reference regardless of
 * which spelling it echoes back. The same `{ qty, card }` object is
 * shared across all keys for a given card, so quantities never drift.
 */
export function buildOwnedIndex(
  resolved: ResolvedCollectionCard[],
): Map<string, OwnedEntry> {
  const byDisplay = new Map<string, OwnedEntry>();
  const index = new Map<string, OwnedEntry>();

  for (const item of resolved) {
    if (!item.card) continue;
    const displayKey = nameKey(getDisplayName(item.card));
    let entry = byDisplay.get(displayKey);
    if (!entry) {
      entry = { qty: 0, card: item.card };
      byDisplay.set(displayKey, entry);
      index.set(displayKey, entry);
    }
    entry.qty += item.entry.quantity;
    const entryAlias = nameKey(item.entry.name);
    // Don't let an alias clobber another card's display-name key.
    if (!index.has(entryAlias)) {
      index.set(entryAlias, entry);
    }
  }

  return index;
}

function countCards(lines: DeckCardLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

function resolveLine(
  line: DeckCardLine,
  owned: Map<string, OwnedEntry>,
): { card: ScryfallCard | null } {
  const direct = owned.get(nameKey(line.name));
  if (direct) return { card: direct.card };
  if (line.scryfallId) {
    for (const entry of owned.values()) {
      if (entry.card.id === line.scryfallId) return { card: entry.card };
    }
  }
  return { card: null };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  enrichedMainboard: Array<DeckCardLine & { card: ScryfallCard | null }>;
  enrichedSideboard: Array<DeckCardLine & { card: ScryfallCard | null }>;
  commanderCard: ScryfallCard | null;
}

export function validateDeck(
  deck: BuiltDeck,
  resolved: ResolvedCollectionCard[],
): ValidationResult {
  const format = getFormat(deck.format);
  const owned = buildOwnedIndex(resolved);
  const errors: string[] = [];
  const warnings: string[] = [];

  const enrichedMainboard = deck.mainboard.map((line) => {
    const { card } = resolveLine(line, owned);
    return { ...line, card };
  });

  const enrichedSideboard = deck.sideboard.map((line) => {
    const { card } = resolveLine(line, owned);
    return { ...line, card };
  });

  let commanderCard: ScryfallCard | null = null;
  if (deck.commander) {
    commanderCard = owned.get(nameKey(deck.commander))?.card ?? null;
    if (!commanderCard) {
      errors.push(`Commander not found in collection: ${deck.commander}`);
    }
  } else if (format.requiresCommander) {
    errors.push("Commander is required for Commander format");
  }

  const commanderColors = commanderCard?.color_identity ?? [];
  const usage = new Map<string, number>();

  const validateLines = (
    lines: Array<DeckCardLine & { card: ScryfallCard | null }>,
    zone: "mainboard" | "sideboard",
  ) => {
    for (const line of lines) {
      if (!line.card) {
        errors.push(`${zone}: unknown card "${line.name}"`);
        continue;
      }

      const displayName = getDisplayName(line.card);
      const displayKey = nameKey(displayName);
      // Owned-quantity must be keyed off the resolved card's display name,
      // not the AI's spelling — otherwise a DFC back-face reference or any
      // entry-name match would look like "0 owned" even though we resolved
      // the same card.
      const ownedQty = owned.get(displayKey)?.qty ?? 0;

      if (ownedQty < line.quantity) {
        errors.push(
          `${zone}: only own ${ownedQty}x ${displayName}, deck uses ${line.quantity}`,
        );
      }

      const legality =
        line.card.legalities[format.scryfallLegalityKey] ?? "not_legal";
      if (legality === "banned" || legality === "not_legal") {
        errors.push(`${displayName} is not legal in ${format.label}`);
      }
      if (legality === "restricted" && line.quantity > 1) {
        errors.push(`${displayName} is restricted to 1 copy`);
      }

      const maxCopies = format.maxCopies(line.card);
      const totalUsed = (usage.get(displayKey) ?? 0) + line.quantity;
      usage.set(displayKey, totalUsed);

      if (!isBasicLand(displayName) && line.quantity > maxCopies) {
        errors.push(
          `${displayName}: max ${maxCopies} copies allowed in ${format.label}`,
        );
      }
      if (!isBasicLand(displayName) && totalUsed > maxCopies) {
        errors.push(
          `${displayName}: ${totalUsed} total copies across deck (max ${maxCopies})`,
        );
      }

      if (
        deck.format === "commander" &&
        commanderCard &&
        !cardMeetsColorIdentity(line.card, commanderColors)
      ) {
        errors.push(
          `${displayName} breaks commander color identity [${commanderColors.join("") || "C"}]`,
        );
      }
    }
  };

  validateLines(enrichedMainboard, "mainboard");
  if (format.sideboardAllowed) {
    validateLines(enrichedSideboard, "sideboard");
  } else if (deck.sideboard.length > 0) {
    errors.push("Sideboard is not allowed in Commander");
  }

  const mainCount = countCards(deck.mainboard);
  if (deck.format === "commander") {
    const total = mainCount + (deck.commander ? 1 : 0);
    if (total !== 100) {
      errors.push(
        `Commander decks need 100 cards (commander + mainboard); got ${total}`,
      );
    }
  } else {
    if (mainCount !== format.minMainboard) {
      errors.push(
        `${format.label} main deck must be ${format.minMainboard} cards; got ${mainCount}`,
      );
    }
    const sbCount = countCards(deck.sideboard);
    if (sbCount > format.maxSideboard) {
      errors.push(`Sideboard max ${format.maxSideboard}; got ${sbCount}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [...warnings, ...deck.warnings],
    enrichedMainboard,
    enrichedSideboard,
    commanderCard,
  };
}
