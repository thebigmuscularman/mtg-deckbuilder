import {
  cardMeetsColorIdentity,
  getFormat,
  isBasicLand,
} from '../formats';
import { buildOwnedIndex } from '../deck-validation';
import type {
  BuiltDeck,
  DeckCardLine,
  FormatId,
  ResolvedCollectionCard,
  ScryfallCard,
} from '../types';
import { countLandsInLines } from '../deck-stats';
import { cardUsdPrice } from '../prices';
import {
  buildAvoidNameKeys,
  cardViolatesHouseRules,
  DEFAULT_HOUSE_RULES,
  isNameAvoided,
  type DeckBuildPreferences,
} from '../deck-preferences';
import { getDisplayName, nameKey } from '../scryfall';
import { COLOR_NAMES, formatColorIdentity } from './color-utils';
import type { OwnedEntry } from '../deck-validation';

const MAX_MAINBOARD_LANDS: Record<FormatId, number> = {
  commander: 40,
  standard: 26,
  modern: 26,
  pioneer: 26,
  pauper: 26,
};

const BASIC_BY_COLOR: Record<string, string> = {
  W: "plains",
  U: "island",
  B: "swamp",
  R: "mountain",
  G: "forest",
};

/** Minimum land count for a deck — used both as a backfill target and as a safety floor. */
export function minLandsFor(
  format: FormatId,
  prefs?: DeckBuildPreferences,
): number {
  if (prefs?.landsTarget && prefs.landsTarget > 0) return prefs.landsTarget;
  if (format === "commander") {
    // High-power decks can run as low as 30 if they have heavy fast-mana.
    return prefs?.powerLevel === "high" ? 30 : 35;
  }
  return 22;
}

export function trimDeckToCollection(
  deck: BuiltDeck,
  resolved: ResolvedCollectionCard[],
  colorPref?: string[],
  maxBudgetUsd?: number,
  brewPrefs?: DeckBuildPreferences,
): { deck: BuiltDeck; adjustments: string[] } {
  const formatRules = getFormat(deck.format);
  const owned = buildOwnedIndex(resolved);
  const adjustments: string[] = [];
  const prefColors = (colorPref ?? []).filter((c) => "WUBRG".includes(c));
  const aiMainQty = deck.mainboard.reduce((s, l) => s + l.quantity, 0);

  const clampLines = (lines: DeckCardLine[], zone: "mainboard" | "sideboard") => {
    const merged = new Map<string, DeckCardLine>();
    for (const line of lines) {
      const key = nameKey(line.name);
      const existing = merged.get(key);
      if (existing) {
        existing.quantity += line.quantity;
        if (!existing.reason && line.reason) existing.reason = line.reason;
      } else {
        merged.set(key, { ...line, name: line.name.trim() });
      }
    }

    const out: DeckCardLine[] = [];
    for (const line of merged.values()) {
      const ownedEntry = owned.get(nameKey(line.name));

      if (!ownedEntry) {
        adjustments.push(`Dropped ${zone} card not in collection: ${line.name}`);
        continue;
      }

      const display = getDisplayName(ownedEntry.card);
      const formatMax = isBasicLand(display)
        ? 99
        : formatRules.maxCopies(ownedEntry.card);
      const allowed = Math.min(ownedEntry.qty, formatMax);

      if (allowed <= 0) {
        adjustments.push(`Dropped ${display} (no copies available).`);
        continue;
      }

      if (maxBudgetUsd && maxBudgetUsd > 0 && cardUsdPrice(ownedEntry.card) > maxBudgetUsd) {
        adjustments.push(
          `Dropped ${display} from ${zone} — over budget ($${cardUsdPrice(ownedEntry.card).toFixed(2)} > $${maxBudgetUsd} max).`,
        );
        continue;
      }

      if (line.quantity > allowed) {
        adjustments.push(
          `Trimmed ${display} from ${line.quantity} to ${allowed} (owned ${ownedEntry.qty}, format max ${formatMax}).`,
        );
      }

      out.push({
        name: display,
        quantity: Math.min(line.quantity, allowed),
        reason: line.reason,
        scryfallId: ownedEntry.card.id,
      });
    }

    return out;
  };

  let commander = deck.commander;
  let commanderReason = deck.commanderReason;
  let commanderCard: ScryfallCard | null = null;
  if (commander) {
    const ownedEntry = owned.get(nameKey(commander));
    if (!ownedEntry) {
      adjustments.push(
        `Dropped commander not in collection: ${commander}. Choose a legendary creature you own.`,
      );
      commander = null;
      commanderReason = undefined;
    } else {
      commander = getDisplayName(ownedEntry.card);
      commanderCard = ownedEntry.card;
    }
  }

  let trimmedMainboard = clampLines(deck.mainboard, "mainboard");
  let trimmedSideboard = clampLines(deck.sideboard, "sideboard");

  const filterLines = (
    lines: DeckCardLine[],
    zone: string,
    keep: (card: ScryfallCard) => string | null,
  ): DeckCardLine[] => {
    const kept: DeckCardLine[] = [];
    for (const line of lines) {
      const ownedEntry = owned.get(nameKey(line.name));
      if (!ownedEntry) {
        kept.push(line);
        continue;
      }
      const reason = keep(ownedEntry.card);
      if (reason) {
        adjustments.push(
          `Dropped ${getDisplayName(ownedEntry.card)} from ${zone} — ${reason}.`,
        );
      } else {
        kept.push(line);
      }
    }
    return kept;
  };

  // Hard filter against the user's color preference (applies to all formats).
  if (prefColors.length) {
    const colorReason = (card: ScryfallCard) =>
      cardMeetsColorIdentity(card, prefColors)
        ? null
        : `outside requested colors ${formatColorIdentity(prefColors)}`;
    trimmedMainboard = filterLines(trimmedMainboard, "mainboard", colorReason);
    trimmedSideboard = filterLines(trimmedSideboard, "sideboard", colorReason);

    if (commanderCard) {
      const commanderIdentity = new Set(commanderCard.color_identity ?? []);
      const requested = new Set(prefColors);
      const exactMatch =
        commanderIdentity.size === requested.size &&
        [...commanderIdentity].every((c) => requested.has(c));
      const strictlyOutside = !cardMeetsColorIdentity(commanderCard, prefColors);

      // For Commander, require commander identity to EXACTLY match user's color combo so
      // the deck actually uses every requested color. For other formats, just drop
      // commanders whose identity leaks outside the requested colors.
      const shouldDrop =
        deck.format === "commander" ? !exactMatch : strictlyOutside;

      if (shouldDrop) {
        adjustments.push(
          `Dropped commander ${commander} — identity ${formatColorIdentity([...commanderIdentity])} does not match requested ${formatColorIdentity(prefColors)}. Pick a legendary creature whose identity is exactly that.`,
        );
        commander = null;
        commanderReason = undefined;
        commanderCard = null;
      }
    }
  }

  // Hard filter color identity violations for Commander.
  if (deck.format === "commander" && commanderCard) {
    const commanderColors = commanderCard.color_identity ?? [];
    const reason = (card: ScryfallCard) =>
      cardMeetsColorIdentity(card, commanderColors)
        ? null
        : `outside commander color identity ${formatColorIdentity(commanderColors)}`;
    trimmedMainboard = filterLines(trimmedMainboard, "mainboard", reason);
    trimmedSideboard = filterLines(trimmedSideboard, "sideboard", reason);

    // Flag if the deck only uses some of the commander's colors.
    if (commanderColors.length >= 2) {
      const used = new Set<string>();
      for (const line of trimmedMainboard) {
        const card = owned.get(nameKey(line.name))?.card;
        if (!card) continue;
        for (const c of card.color_identity ?? []) used.add(c);
      }
      const missing = commanderColors.filter((c) => !used.has(c));
      if (missing.length) {
        adjustments.push(
          `Deck under-uses the commander's color identity — missing meaningful ${missing
            .map((c) => COLOR_NAMES[c] ?? c)
            .join(" / ")} cards. Click "Fix errors with AI" to rebalance.`,
        );
      }
    }
  }

  const avoidCards = brewPrefs?.avoidCards ?? [];
  const avoidKeys = avoidCards.length
    ? buildAvoidNameKeys(avoidCards, resolved)
    : new Set<string>();
  const houseRules = brewPrefs?.houseRules ?? DEFAULT_HOUSE_RULES;
  const enforceHouseRules =
    houseRules.noMassLandDestruction ||
    houseRules.noInfiniteCombos ||
    houseRules.noExtraTurns;

  if (avoidKeys.size || enforceHouseRules) {
    const reason = (card: ScryfallCard) => {
      const display = getDisplayName(card);
      if (avoidKeys.size && isNameAvoided(display, avoidKeys)) {
        return "on user ban list";
      }
      if (enforceHouseRules) {
        const violation = cardViolatesHouseRules(card, houseRules);
        if (violation) return `violates house rule (${violation})`;
      }
      return null;
    };
    trimmedMainboard = filterLines(trimmedMainboard, "mainboard", reason);
    trimmedSideboard = filterLines(trimmedSideboard, "sideboard", reason);

    if (commander && commanderCard) {
      const display = getDisplayName(commanderCard);
      if (avoidKeys.size && isNameAvoided(display, avoidKeys)) {
        adjustments.push(`Dropped commander ${display} — on user ban list.`);
        commander = null;
        commanderReason = undefined;
        commanderCard = null;
      } else if (enforceHouseRules) {
        const violation = cardViolatesHouseRules(commanderCard, houseRules);
        if (violation) {
          adjustments.push(
            `Dropped commander ${display} — violates house rule (${violation}).`,
          );
          commander = null;
          commanderReason = undefined;
          commanderCard = null;
        }
      }
    }
  }

  const sumQty = (lines: DeckCardLine[]) =>
    lines.reduce((s, l) => s + l.quantity, 0);

  const targetMain =
    deck.format === "commander" ? 99 : formatRules.minMainboard;
  const maxSide = formatRules.maxSideboard;

  // Pool of signals about what the AI thinks matters — used to protect star cards
  // from the trim and target the fluff for cuts.
  const importanceText = [
    deck.name ?? "",
    deck.description ?? "",
    deck.archetype ?? "",
    deck.overview ?? "",
    deck.strategy ?? "",
    ...(deck.winConditions ?? []),
    ...(deck.strengths ?? []),
  ]
    .join(" \u2022 ")
    .toLowerCase();

  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const importanceScore = (
    line: DeckCardLine,
    position: number,
  ): { score: number; isBasic: boolean; isLand: boolean } => {
    const key = nameKey(line.name);
    const card = owned.get(key)?.card ?? null;
    const typeLine = (card?.type_line ?? "").toLowerCase();
    const isBasic = isBasicLand(line.name);
    const isLand = isBasic || typeLine.includes("land");

    let score = 0;
    if (isBasic) score += 5000;
    else if (isLand) score += 1200;
    // Word-boundary avoids "Bolt" matching "thunderbolt" in the prose.
    const nameWordBoundary = new RegExp(`\\b${escapeRegex(key)}\\b`);
    if (nameWordBoundary.test(importanceText)) score += 800;
    // Multicolor cards in a multi-color deck are signature picks; protect them.
    const cardIdentity = card?.color_identity ?? [];
    if (prefColors.length >= 2 && cardIdentity.length >= 2) score += 600;
    // Higher copy counts in 60-card formats signal core 4-of staples.
    score += line.quantity * 120;
    // The AI tends to list important cards first; later positions skew toward filler.
    score += Math.max(0, 240 - position * 6);
    // A real reason ("kills Phyrexian Obliterator, blocks fliers") is harder
    // to write for filler picks than for staples.
    if (line.reason && line.reason.trim().length > 25) score += 80;
    else if (line.reason && line.reason.trim().length > 10) score += 30;
    return { score, isBasic, isLand };
  };

  // Mainboard: cut the least important cards first (low quantity, low position,
  // not lands, not win-conditions). Basics are never cut here — they're the mana base.
  let mainCount = sumQty(trimmedMainboard);
  if (mainCount > targetMain) {
    const totalExcess = mainCount - targetMain;
    let excess = totalExcess;
    const scored = trimmedMainboard.map((line, idx) => ({
      idx,
      line,
      ...importanceScore(line, idx),
    }));
    scored.sort((a, b) => a.score - b.score);

    const cutSummary: Array<{ name: string; count: number }> = [];
    const cutFrom = (predicate: (s: (typeof scored)[number]) => boolean) => {
      for (const item of scored) {
        if (excess <= 0) break;
        if (!predicate(item)) continue;
        const current = trimmedMainboard[item.idx].quantity;
        if (current <= 0) continue;
        const take = Math.min(excess, current);
        trimmedMainboard[item.idx].quantity -= take;
        excess -= take;
        cutSummary.push({ name: item.line.name, count: take });
      }
    };

    // Pass 1: cut non-land, non-essential cards (the actual fluff).
    cutFrom((s) => !s.isLand);
    // Pass 2: if we still have to lose cards, trim non-basic lands next.
    cutFrom((s) => s.isLand && !s.isBasic);
    // Pass 3: last resort — touch basics only if the deck somehow has no other cards left.
    cutFrom((s) => s.isBasic);

    trimmedMainboard = trimmedMainboard.filter((l) => l.quantity > 0);

    const cutList = cutSummary
      .slice(0, 6)
      .map((c) => (c.count > 1 ? `${c.count}x ${c.name}` : c.name))
      .join(", ");
    const more = cutSummary.length > 6 ? ` (+${cutSummary.length - 6} more)` : "";
    adjustments.push(
      `Mainboard was ${totalExcess} card${totalExcess === 1 ? "" : "s"} over ${targetMain}; cut the lowest-impact picks${cutList ? `: ${cutList}${more}` : ""}.`,
    );
    mainCount = sumQty(trimmedMainboard);
  }

  const countLands = () =>
    countLandsInLines(trimmedMainboard, (line) =>
      owned.get(nameKey(line.name))?.card ?? null,
    );

  const countSpells = () => {
    let n = 0;
    for (const line of trimmedMainboard) {
      const card = owned.get(nameKey(line.name))?.card ?? null;
      const typeLine = (card?.type_line ?? "").toLowerCase();
      if (isBasicLand(line.name) || typeLine.includes("land")) continue;
      n += line.quantity;
    }
    return n;
  };

  const minLands = minLandsFor(deck.format, brewPrefs);
  const minSpells = targetMain - minLands;
  const maxLandsCap = MAX_MAINBOARD_LANDS[deck.format];

  /**
   * Ordered list of basic-land "buckets" we'll round-robin when adding lands.
   * For Commander we follow the commander's color identity; otherwise the
   * user's color pref; otherwise whatever basics they own.
   */
  const basicBuckets = (): Array<{ card: ScryfallCard; entry: OwnedEntry }> => {
    const seen = new Set<string>();
    const allBasics = [...owned.values()]
      .filter(({ card }) => {
        if (!isBasicLand(getDisplayName(card))) return false;
        if (seen.has(card.id)) return false;
        seen.add(card.id);
        return true;
      });

    // Color priority: commander identity > user color preference >
    // colors already represented by basics in the in-progress deck.
    // The last fallback matters when the trim is run with no color hints
    // (tests, ad-hoc tools) — we still want to mirror what the AI shipped
    // rather than randomly adding Plains to a mono-red deck.
    const basicsAlreadyInDeck = new Set<string>();
    for (const line of trimmedMainboard) {
      const nameLower = nameKey(line.name);
      for (const [color, basicName] of Object.entries(BASIC_BY_COLOR)) {
        if (nameLower === basicName || nameLower === `snow-covered ${basicName}`) {
          basicsAlreadyInDeck.add(color);
        }
      }
    }
    const targetColors =
      deck.format === "commander" && commanderCard
        ? commanderCard.color_identity ?? []
        : prefColors.length
          ? prefColors
          : [...basicsAlreadyInDeck];

    if (targetColors.length) {
      // Round-robin order: split evenly across the requested colors so a
      // 2-color deck doesn't end up with 22 Forests.
      const byColor = new Map<string, OwnedEntry>();
      for (const entry of allBasics) {
        const name = nameKey(getDisplayName(entry.card));
        for (const [color, basicName] of Object.entries(BASIC_BY_COLOR)) {
          if (!targetColors.includes(color)) continue;
          if (name === basicName || name === `snow-covered ${basicName}`) {
            byColor.set(color, entry);
          }
        }
      }
      const ordered: Array<{ card: ScryfallCard; entry: OwnedEntry }> = [];
      for (const color of targetColors) {
        const entry = byColor.get(color);
        if (entry) ordered.push({ card: entry.card, entry });
      }
      if (ordered.length) return ordered;
    }

    return allBasics
      .sort((a, b) => b.qty - a.qty)
      .map((entry) => ({ card: entry.card, entry }));
  };

  /** Add up to `requested` basics, round-robin across buckets so colors stay even. */
  const addBasics = (requested: number): number => {
    const buckets = basicBuckets();
    if (!buckets.length || requested <= 0) return 0;
    const usedFromBucket = new Map<string, number>();
    let added = 0;
    let exhaustedBuckets = 0;
    while (added < requested && exhaustedBuckets < buckets.length) {
      exhaustedBuckets = 0;
      for (const bucket of buckets) {
        if (added >= requested) break;
        const display = getDisplayName(bucket.card);
        const displayKey = nameKey(display);
        const existing = trimmedMainboard.find(
          (l) => nameKey(l.name) === displayKey,
        );
        const usedByDeck = existing?.quantity ?? 0;
        const usedTotal = usedFromBucket.get(displayKey) ?? usedByDeck;
        if (usedTotal >= bucket.entry.qty) {
          exhaustedBuckets++;
          continue;
        }
        if (existing) existing.quantity += 1;
        else
          trimmedMainboard.push({
            name: display,
            quantity: 1,
            reason: "Mana fixer added to keep the mana base playable.",
            scryfallId: bucket.card.id,
          });
        usedFromBucket.set(displayKey, usedTotal + 1);
        added++;
      }
    }
    return added;
  };

  /** Cut up to `count` quantities of the lowest-importance non-land spells. */
  const cutNonLandSpells = (count: number): number => {
    if (count <= 0) return 0;
    const scored = trimmedMainboard
      .map((line, idx) => ({ idx, line, ...importanceScore(line, idx) }))
      .filter((s) => !s.isLand)
      .sort((a, b) => a.score - b.score);
    let cut = 0;
    for (const item of scored) {
      if (cut >= count) break;
      const current = trimmedMainboard[item.idx].quantity;
      if (current <= 0) continue;
      const take = Math.min(count - cut, current);
      trimmedMainboard[item.idx].quantity -= take;
      cut += take;
    }
    trimmedMainboard = trimmedMainboard.filter((l) => l.quantity > 0);
    return cut;
  };

  const keptMainQty = sumQty(trimmedMainboard);
  const spells = countSpells();
  const lands = countLands();
  const dropRate = aiMainQty > 0 ? 1 - keptMainQty / aiMainQty : 0;
  /** Filters removed most of the AI list — padding with virtual basics would swamp the deck. */
  const spellCollapse =
    aiMainQty >= 15 && dropRate > 0.8 && spells < minSpells;

  // Mainboard shortfall: only top up lands toward minLands — never replace missing
  // spells with basics (virtual basics made that path too aggressive).
  if (mainCount < targetMain) {
    const need = targetMain - mainCount;
    if (spellCollapse || spells < minSpells * 0.5) {
      adjustments.push(
        `⚠️ DECK INCOMPLETE: After collection, color, and budget filters only ${spells} non-land card${spells === 1 ? "" : "s"} remain (${Math.round(dropRate * 100)}% of the AI list was removed). Not padding with basics — widen your color selection, upload more cards, or relax budget/ban rules, then rebuild.`,
      );
      if (spells >= 8 && lands < minLands) {
        const topUp = Math.min(
          minLands - lands,
          spells,
          maxLandsCap - lands,
        );
        const added = topUp > 0 ? addBasics(topUp) : 0;
        if (added > 0) {
          adjustments.push(
            `Added ${added} basic${added === 1 ? "" : "s"} for mana only (spell base too thin for a full ${targetMain}-card list).`,
          );
        }
      }
    } else {
      const landShortfall = Math.max(0, minLands - lands);
      const basicsAdded = addBasics(
        Math.min(need, landShortfall, maxLandsCap - lands),
      );
      if (basicsAdded > 0) {
        adjustments.push(
          `Mainboard was ${need} card${need === 1 ? "" : "s"} short; added ${basicsAdded} basic${basicsAdded === 1 ? "" : "s"} for mana (target ≥${minLands} lands, not ${maxLandsCap}).`,
        );
      }
      const stillShort = targetMain - sumQty(trimmedMainboard);
      if (stillShort > 0) {
        adjustments.push(
          `⚠️ DECK INCOMPLETE: Still ${stillShort} card${stillShort === 1 ? "" : "s"} short (${sumQty(trimmedMainboard)}/${targetMain}, ${countLands()} lands, ${countSpells()} spells). Add more legal cards to your collection or adjust filters.`,
        );
      }
    }
    mainCount = sumQty(trimmedMainboard);
  }

  // Land floor: swap low-impact spells for basics only when the spell base is healthy.
  const currentLands = countLands();
  const currentSpells = countSpells();
  if (currentLands < minLands && !spellCollapse) {
    const landDeficit = minLands - currentLands;
    if (currentSpells >= minSpells * 0.6) {
      const minSpellFloor = Math.ceil(minSpells * 0.6);
      const maxCut = Math.max(0, currentSpells - minSpellFloor);
      const cut = cutNonLandSpells(Math.min(landDeficit, maxCut));
      const added = addBasics(
        Math.min(cut, landDeficit, maxLandsCap - currentLands),
      );
      if (added > 0) {
        adjustments.push(
          `Land floor enforced: ${currentLands} → ${countLands()} lands (target ≥${minLands}). Swapped ${added} low-impact spell${added === 1 ? "" : "s"} for basics.`,
        );
      } else if (cut > 0) {
        adjustments.push(
          `⚠️ Only ${currentLands} lands and no basics available to backfill. Add basic lands to your collection.`,
        );
      }
    } else if (currentSpells > 0) {
      const topUp = Math.min(
        landDeficit,
        maxLandsCap - currentLands,
        currentSpells,
      );
      const added = topUp > 0 ? addBasics(topUp) : 0;
      if (added > 0) {
        adjustments.push(
          `Added ${added} basic${added === 1 ? "" : "s"} for mana (only ${currentSpells} spells remain — not cutting more for lands).`,
        );
      }
    }
    mainCount = sumQty(trimmedMainboard);
  }

  // Sideboard: enforce max.
  if (deck.format === "commander") {
    if (trimmedSideboard.length) {
      adjustments.push("Commander format has no sideboard; removed sideboard cards.");
    }
    trimmedSideboard = [];
  } else if (sumQty(trimmedSideboard) > maxSide) {
    const totalExcessSb = sumQty(trimmedSideboard) - maxSide;
    let excessSb = totalExcessSb;
    const scoredSb = trimmedSideboard
      .map((line, idx) => ({ idx, line, ...importanceScore(line, idx) }))
      .sort((a, b) => a.score - b.score);
    const cutSummarySb: Array<{ name: string; count: number }> = [];
    for (const item of scoredSb) {
      if (excessSb <= 0) break;
      const current = trimmedSideboard[item.idx].quantity;
      if (current <= 0) continue;
      const take = Math.min(excessSb, current);
      trimmedSideboard[item.idx].quantity -= take;
      excessSb -= take;
      cutSummarySb.push({ name: item.line.name, count: take });
    }
    trimmedSideboard = trimmedSideboard.filter((l) => l.quantity > 0);
    const cutList = cutSummarySb
      .slice(0, 4)
      .map((c) => (c.count > 1 ? `${c.count}x ${c.name}` : c.name))
      .join(", ");
    adjustments.push(
      `Sideboard trimmed to the ${maxSide}-card max; cut lowest-impact picks${cutList ? `: ${cutList}` : ""}.`,
    );
  }

  return {
    deck: {
      ...deck,
      commander,
      commanderReason,
      mainboard: trimmedMainboard,
      sideboard: trimmedSideboard,
    },
    adjustments,
  };
}