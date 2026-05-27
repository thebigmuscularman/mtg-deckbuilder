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

const MAX_MAINBOARD_LANDS: Record<FormatId, number> = {
  commander: 40,
  standard: 26,
  modern: 26,
  pioneer: 26,
  pauper: 26,
};

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

  // Hard filter against the user's color preference (applies to all formats).
  if (prefColors.length) {
    const filterByPref = (lines: DeckCardLine[], zone: string) => {
      const kept: DeckCardLine[] = [];
      for (const line of lines) {
        const ownedEntry = owned.get(nameKey(line.name));
        if (!ownedEntry) {
          kept.push(line);
          continue;
        }
        if (cardMeetsColorIdentity(ownedEntry.card, prefColors)) {
          kept.push(line);
        } else {
          adjustments.push(
            `Dropped ${getDisplayName(ownedEntry.card)} from ${zone} — outside requested colors ${formatColorIdentity(prefColors)}.`,
          );
        }
      }
      return kept;
    };
    trimmedMainboard = filterByPref(trimmedMainboard, "mainboard");
    trimmedSideboard = filterByPref(trimmedSideboard, "sideboard");

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
    const filterByColor = (lines: DeckCardLine[], zone: string) => {
      const kept: DeckCardLine[] = [];
      for (const line of lines) {
        const ownedEntry = owned.get(nameKey(line.name));
        if (!ownedEntry) {
          kept.push(line);
          continue;
        }
        if (cardMeetsColorIdentity(ownedEntry.card, commanderColors)) {
          kept.push(line);
        } else {
          adjustments.push(
            `Dropped ${getDisplayName(ownedEntry.card)} from ${zone} — outside commander color identity ${formatColorIdentity(commanderColors)}.`,
          );
        }
      }
      return kept;
    };
    trimmedMainboard = filterByColor(trimmedMainboard, "mainboard");
    trimmedSideboard = filterByColor(trimmedSideboard, "sideboard");

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
    const filterByPrefs = (lines: DeckCardLine[], zone: string) => {
      const kept: DeckCardLine[] = [];
      for (const line of lines) {
        const ownedEntry = owned.get(nameKey(line.name));
        if (!ownedEntry) {
          kept.push(line);
          continue;
        }
        const display = getDisplayName(ownedEntry.card);
        if (avoidKeys.size && isNameAvoided(display, avoidKeys)) {
          adjustments.push(`Dropped ${display} from ${zone} — on user ban list.`);
          continue;
        }
        if (enforceHouseRules) {
          const violation = cardViolatesHouseRules(ownedEntry.card, houseRules);
          if (violation) {
            adjustments.push(
              `Dropped ${display} from ${zone} — violates house rule (${violation}).`,
            );
            continue;
          }
        }
        kept.push(line);
      }
      return kept;
    };

    trimmedMainboard = filterByPrefs(trimmedMainboard, "mainboard");
    trimmedSideboard = filterByPrefs(trimmedSideboard, "sideboard");

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

  // Mainboard: backfill with owned basics only up to a sane land cap — never pad
  // to 60/99 with basics when collection/color/budget filters removed most spells.
  if (mainCount < targetMain) {
    const need = targetMain - mainCount;
    const maxLands = MAX_MAINBOARD_LANDS[deck.format];
    const countLands = () =>
      countLandsInLines(trimmedMainboard, (line) =>
        owned.get(nameKey(line.name))?.card ?? null,
      );
    const landHeadroom = Math.max(0, maxLands - countLands());
    const basicsBudget = Math.min(need, landHeadroom);

    // owned indexes each card under multiple aliases — dedupe by card id.
    const seenBasic = new Set<string>();
    const basics = [...owned.values()]
      .filter(({ card }) => {
        if (!isBasicLand(getDisplayName(card))) return false;
        if (seenBasic.has(card.id)) return false;
        seenBasic.add(card.id);
        return true;
      })
      .sort((a, b) => b.qty - a.qty);

    let remaining = basicsBudget;
    let basicsAdded = 0;
    for (const basic of basics) {
      if (remaining <= 0) break;
      const display = getDisplayName(basic.card);
      const displayKey = nameKey(display);
      const existing = trimmedMainboard.find(
        (l) => nameKey(l.name) === displayKey,
      );
      const used = existing?.quantity ?? 0;
      const headroom = basic.qty - used;
      if (headroom <= 0) continue;
      const add = Math.min(headroom, remaining);
      if (existing) {
        existing.quantity += add;
      } else {
        trimmedMainboard.push({
          name: display,
          quantity: add,
          reason: "Mana fixer added to meet the deck size requirement.",
          scryfallId: basic.card.id,
        });
      }
      basicsAdded += add;
      remaining -= add;
    }

    mainCount = sumQty(trimmedMainboard);
    const stillShort = targetMain - mainCount;

    if (basicsAdded > 0) {
      adjustments.push(
        `Mainboard was ${need} card${need === 1 ? "" : "s"} short; added ${basicsAdded} owned basic land${basicsAdded === 1 ? "" : "s"} (land cap ${maxLands}).`,
      );
    }
    if (remaining > 0 && basicsAdded < basicsBudget) {
      adjustments.push(
        `Could not add ${remaining} more basic land${remaining === 1 ? "" : "s"} — not enough owned basics.`,
      );
    }
    if (stillShort > 0) {
      adjustments.push(
        `⚠️ DECK INCOMPLETE: Mainboard is ${stillShort} card${stillShort === 1 ? "" : "s"} short of ${targetMain} (${mainCount} cards, ${countLands()} lands). After collection, color, and budget filters there are not enough legal non-land cards to fill the list — basics backfill stops at ${maxLands} lands so the deck stays playable. Widen your color selection or raise the budget cap, then rebuild.`,
      );
    }
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