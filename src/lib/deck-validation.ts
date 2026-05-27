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
import { getDisplayName } from "./scryfall";

type CardLookup = Map<string, ScryfallCard>;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function buildLookup(resolved: ResolvedCollectionCard[]): CardLookup {
  const map = new Map<string, ScryfallCard>();
  for (const item of resolved) {
    if (!item.card) continue;
    map.set(normalizeName(item.entry.name), item.card);
    map.set(normalizeName(getDisplayName(item.card)), item.card);
  }
  return map;
}

function buildOwnedCounts(resolved: ResolvedCollectionCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of resolved) {
    if (!item.card) continue;
    const key = normalizeName(getDisplayName(item.card));
    counts.set(key, (counts.get(key) ?? 0) + item.entry.quantity);
  }
  return counts;
}

function countCards(lines: DeckCardLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

function resolveLine(
  line: DeckCardLine,
  lookup: CardLookup,
): { card: ScryfallCard | null; name: string } {
  const card =
    lookup.get(normalizeName(line.name)) ??
    (line.scryfallId
      ? [...lookup.values()].find((c) => c.id === line.scryfallId) ?? null
      : null);
  return { card, name: line.name };
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
  const lookup = buildLookup(resolved);
  const owned = buildOwnedCounts(resolved);
  const errors: string[] = [];
  const warnings: string[] = [];

  const enrichedMainboard = deck.mainboard.map((line) => {
    const { card } = resolveLine(line, lookup);
    return { ...line, card };
  });

  const enrichedSideboard = deck.sideboard.map((line) => {
    const { card } = resolveLine(line, lookup);
    return { ...line, card };
  });

  let commanderCard: ScryfallCard | null = null;
  if (deck.commander) {
    commanderCard =
      lookup.get(normalizeName(deck.commander)) ??
      [...lookup.values()].find(
        (c) => normalizeName(getDisplayName(c)) === normalizeName(deck.commander!),
      ) ??
      null;
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
      const nameKey = normalizeName(line.name);
      const ownedQty = owned.get(nameKey) ?? 0;

      if (!line.card) {
        errors.push(`${zone}: unknown card "${line.name}"`);
        continue;
      }

      const displayName = getDisplayName(line.card);
      const displayKey = normalizeName(displayName);

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
