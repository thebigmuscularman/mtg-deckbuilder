"use client";

import Image from "next/image";
import { useMemo } from "react";
import { groupLinesByType } from "@/lib/card-groups";
import { comparePowerToTarget } from "@/lib/deck-preferences";
import {
  computeDeckStats,
  estimateDeckPowerLevel,
  getLandWarnings,
} from "@/lib/deck-stats";
import type { PowerLevelId } from "@/lib/power-levels";
import { exportDeck, type ExportFormat } from "@/lib/export-formats";
import { deckEstimatedValue } from "@/lib/prices";
import { getCardImage, getDisplayName } from "@/lib/scryfall";
import type { BuiltDeck, ScryfallCard } from "@/lib/types";
import { CardHoverPreview } from "./CardHoverPreview";
import { DeckStatsPanel } from "./DeckStatsPanel";
import { ManaIdentityBadge } from "./ManaIdentityBadge";
import type { CardActions, Zone } from "./deck-builder/types";

type EnrichedLine = {
  name: string;
  quantity: number;
  card: ScryfallCard | null;
  reason?: string;
};

interface DeckDisplayProps extends CardActions {
  deck: BuiltDeck;
  enriched?: {
    mainboard: EnrichedLine[];
    sideboard: EnrichedLine[];
    commander: ScryfallCard | null;
  };
  validation?: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
  targetPowerLevel?: PowerLevelId;
  onRebuildForPower?: () => void;
  rebuilding?: boolean;
}

function manaClass(inner: string): string {
  const cleaned = inner.toLowerCase().replace(/\//g, "");
  return `ms ms-${cleaned} ms-cost ms-shadow`;
}

function formatManaCost(cost?: string) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  if (!symbols.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-0.5 text-base leading-none">
      {symbols.map((sym, i) => {
        const inner = sym.slice(1, -1);
        return <i key={i} className={manaClass(inner)} title={inner} />;
      })}
    </span>
  );
}

type CardRowProps = {
  line: EnrichedLine;
  zone: Zone;
  swapping?: boolean;
} & Pick<CardActions, "onSwap" | "onQuantityChange" | "onRemove">;

function CardRow({
  line,
  zone,
  onSwap,
  swapping,
  onQuantityChange,
  onRemove,
}: CardRowProps) {
  const image = line.card ? getCardImage(line.card) : undefined;
  const name = line.card ? getDisplayName(line.card) : line.name;

  return (
    <li className="card-hover group flex gap-3 rounded-xl border border-stone-800/80 bg-gradient-to-br from-stone-900/70 to-stone-950/70 px-3 py-2.5 backdrop-blur">
      {image ? (
        <div className="relative h-24 w-[68px] shrink-0 overflow-hidden rounded-lg ring-1 ring-stone-700/60 transition group-hover:ring-amber-500/40">
          <Image
            src={image}
            alt={name}
            fill
            sizes="68px"
            className="object-cover transition group-hover:scale-105"
            unoptimized
          />
        </div>
      ) : (
        <div className="flex h-24 w-[68px] shrink-0 items-center justify-center rounded-lg bg-stone-800 text-xs text-stone-500 ring-1 ring-stone-700/60">
          ?
        </div>
      )}
      <div className="min-w-0 flex-1">
        <CardHoverPreview card={line.card}>
          <div className="flex items-start justify-between gap-2">
            <p className="truncate font-semibold text-amber-50">
              <span className="mr-1 inline-block min-w-[1.75rem] rounded bg-amber-500/15 px-1.5 text-center text-xs font-bold tabular-nums text-amber-300 ring-1 ring-amber-700/30">
                {line.quantity}
              </span>
              {name}
            </p>
            {line.card?.mana_cost && (
              <div className="shrink-0">{formatManaCost(line.card.mana_cost)}</div>
            )}
          </div>
        </CardHoverPreview>
        {line.card && (
          <p className="truncate text-xs italic text-stone-400">{line.card.type_line}</p>
        )}
        {line.reason && (
          <p className="mt-1.5 text-xs leading-relaxed text-stone-300/85">
            <span className="font-semibold text-amber-500/90">Why:</span> {line.reason}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onQuantityChange && zone !== "commander" && (
            <div className="flex items-center gap-1 rounded-lg bg-stone-800/80 px-1 py-0.5 ring-1 ring-stone-700/60">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() =>
                  onQuantityChange(name, zone, Math.max(1, line.quantity - 1))
                }
                className="px-2 py-0.5 text-sm text-stone-300 hover:text-amber-300"
              >
                −
              </button>
              <span className="min-w-[1.25rem] text-center text-xs tabular-nums text-amber-200">
                {line.quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => onQuantityChange(name, zone, line.quantity + 1)}
                className="px-2 py-0.5 text-sm text-stone-300 hover:text-amber-300"
              >
                +
              </button>
            </div>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(name, zone)}
              className="rounded-lg bg-stone-800/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-rose-400/90 ring-1 ring-stone-700/60 transition hover:bg-rose-950/40 hover:text-rose-300"
            >
              Remove
            </button>
          )}
          {onSwap && (
            <button
              type="button"
              disabled={swapping}
              onClick={() => onSwap(name, zone)}
              className="rounded-lg bg-stone-800/80 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-stone-400 ring-1 ring-stone-700/60 transition hover:bg-amber-950/50 hover:text-amber-300 disabled:opacity-50"
            >
              {swapping ? "Swapping…" : "↻ Reroll card"}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

const INFO_PALETTE = {
  amber: { box: "bg-amber-950/30 ring-amber-700/40", head: "text-amber-300", bullet: "text-amber-500/80" },
  emerald: { box: "bg-emerald-950/30 ring-emerald-800/40", head: "text-emerald-300", bullet: "text-emerald-400/80" },
  rose: { box: "bg-rose-950/30 ring-rose-800/40", head: "text-rose-300", bullet: "text-rose-400/80" },
} as const;

function InfoList({
  title,
  icon,
  items,
  accent,
}: {
  title: string;
  icon: string;
  items: string[];
  accent: keyof typeof INFO_PALETTE;
}) {
  const p = INFO_PALETTE[accent];
  return (
    <div className={`rounded-2xl ${p.box} p-4 ring-1`}>
      <p className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] ${p.head}`}>
        <span className="text-sm">{icon}</span>
        {title}
      </p>
      <ul className="space-y-1.5 text-sm leading-snug text-stone-200/90">
        {items.map((item, i) => (
          <li key={`${i}-${item}`} className="flex gap-2">
            <span className={`mt-1 shrink-0 ${p.bullet}`}>•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-700/50" />
      <h3 className="text-sm font-bold uppercase tracking-[0.25em] text-amber-400">
        {title}{" "}
        <span className="ml-1 text-stone-500 normal-case tracking-normal">
          · {count} cards
        </span>
      </h3>
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-700/50" />
    </div>
  );
}

function GroupedSection({
  title,
  lines,
  zone,
  onSwap,
  swappingCard,
  onQuantityChange,
  onRemove,
}: {
  title: string;
  lines: EnrichedLine[];
  zone: Exclude<Zone, "commander">;
} & CardActions) {
  if (!lines.length) return null;
  const groups = groupLinesByType(lines);
  const total = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <section>
      <SectionHeader title={title} count={total} />
      <div className="space-y-6">
        {groups.map(({ section, lines: groupLines }) => {
          const sectionCount = groupLines.reduce((s, l) => s + l.quantity, 0);
          return (
            <div key={section}>
              <h4 className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-stone-500">
                {section} · {sectionCount}
              </h4>
              <ul className="grid gap-2 sm:grid-cols-2">
                {groupLines.map((line, i) => (
                  <CardRow
                    key={`${section}-${line.name}-${i}`}
                    line={line}
                    zone={zone}
                    onSwap={onSwap}
                    swapping={swappingCard === line.name}
                    onQuantityChange={onQuantityChange}
                    onRemove={onRemove}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const EXPORT_OPTIONS: Array<[ExportFormat, string]> = [
  ["moxfield", "Copy Moxfield"],
  ["archidekt", "Copy Archidekt"],
  ["mtga", "Copy MTGA"],
  ["plain", "Copy plain"],
];

function ExportButtons({ deck }: { deck: BuiltDeck }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXPORT_OPTIONS.map(([fmt, label]) => (
        <button
          key={fmt}
          type="button"
          onClick={() => navigator.clipboard.writeText(exportDeck(deck, fmt))}
          className="card-hover rounded-lg bg-stone-900/60 px-3 py-1.5 text-xs font-semibold text-amber-200/90 ring-1 ring-stone-700/60 hover:text-amber-100"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function DeckHeader({
  deck,
  validation,
  commanderIdentity,
}: {
  deck: BuiltDeck;
  validation?: { valid: boolean };
  commanderIdentity: string[];
}) {
  const hasInfo =
    deck.winConditions?.length ||
    deck.strengths?.length ||
    deck.weaknesses?.length;
  return (
    <header className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em]">
          <span className="text-amber-500/80">Brewed deck</span>
          {deck.archetype && (
            <span className="rounded-full border border-amber-700/40 bg-amber-950/40 px-3 py-0.5 text-amber-300/90">
              {deck.archetype}
            </span>
          )}
          <span className="rounded-full border border-stone-700/60 bg-stone-900/60 px-3 py-0.5 text-stone-400">
            {deck.format}
          </span>
          {commanderIdentity.length > 0 && (
            <ManaIdentityBadge colors={commanderIdentity} />
          )}
        </div>
        <h2 className="shimmer-text text-3xl font-black tracking-tight sm:text-4xl">
          {deck.name}
        </h2>
        <p className="text-stone-300/90 sm:text-lg">{deck.description}</p>
        {deck.commander && (
          <p className="text-sm text-amber-300/90">
            <span className="font-semibold uppercase tracking-[0.15em] text-amber-500/80">
              Commander:
            </span>{" "}
            <span className="font-semibold text-amber-100">{deck.commander}</span>
          </p>
        )}
        {deck.overview && (
          <div className="rounded-2xl border border-amber-900/30 bg-stone-950/40 p-4 text-sm leading-relaxed text-stone-200/95 sm:text-base">
            {deck.overview}
          </div>
        )}
        {hasInfo && (
          <div className="grid gap-3 sm:grid-cols-3">
            {deck.winConditions && deck.winConditions.length > 0 && (
              <InfoList title="Win conditions" icon="🏆" items={deck.winConditions} accent="amber" />
            )}
            {deck.strengths && deck.strengths.length > 0 && (
              <InfoList title="Strengths" icon="💪" items={deck.strengths} accent="emerald" />
            )}
            {deck.weaknesses && deck.weaknesses.length > 0 && (
              <InfoList title="Weaknesses" icon="⚠" items={deck.weaknesses} accent="rose" />
            )}
          </div>
        )}
        {validation?.valid && (
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/50 px-4 py-1.5 text-sm font-medium text-emerald-300">
            <span className="text-base">✓</span>
            Legal & playable from your collection
          </div>
        )}
      </div>
    </header>
  );
}

export function DeckDisplay({
  deck,
  enriched,
  validation,
  onSwap,
  swappingCard,
  targetPowerLevel,
  onQuantityChange,
  onRemove,
  onRebuildForPower,
  rebuilding,
}: DeckDisplayProps) {
  const mainboard: EnrichedLine[] =
    enriched?.mainboard ?? deck.mainboard.map((l) => ({ ...l, card: null }));
  const sideboard: EnrichedLine[] =
    enriched?.sideboard ?? deck.sideboard.map((l) => ({ ...l, card: null }));
  const commanderCard = enriched?.commander ?? null;

  const stats = useMemo(() => computeDeckStats(mainboard), [mainboard]);
  const landWarnings = useMemo(
    () => getLandWarnings(deck.format, stats),
    [deck.format, stats],
  );
  const powerLevel = useMemo(
    () => estimateDeckPowerLevel(deck, mainboard, commanderCard),
    [deck, mainboard, commanderCard],
  );
  const powerComparison = useMemo(() => {
    if (!powerLevel || !targetPowerLevel) return null;
    return comparePowerToTarget(
      powerLevel.score,
      powerLevel.label,
      targetPowerLevel,
    );
  }, [powerLevel, targetPowerLevel]);
  const deckValue = useMemo(
    () => deckEstimatedValue(mainboard, commanderCard),
    [mainboard, commanderCard],
  );

  const commanderIdentity =
    commanderCard?.color_identity ?? [];

  return (
    <div className="space-y-10">
      <DeckHeader
        deck={deck}
        validation={validation}
        commanderIdentity={commanderIdentity}
      />

      <DeckStatsPanel
        stats={stats}
        landWarnings={landWarnings}
        powerLevel={powerLevel}
        powerComparison={powerComparison}
        onRebuildForPower={onRebuildForPower}
        rebuilding={rebuilding}
        deckValueUsd={deckValue}
        colorIdentity={commanderIdentity}
      />

      <ExportButtons deck={deck} />

      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
        <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
          <span className="text-lg">⚔</span> Game plan
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200/90 sm:text-base">
          {deck.strategy}
        </p>
      </div>

      {commanderCard && (
        <section>
          <SectionHeader title="Commander" count={1} />
          <CardRow
            line={{
              name: getDisplayName(commanderCard),
              quantity: 1,
              card: commanderCard,
              reason: deck.commanderReason,
            }}
            zone="commander"
            onSwap={onSwap}
            swapping={swappingCard === getDisplayName(commanderCard)}
            onRemove={onRemove}
          />
        </section>
      )}

      <GroupedSection
        title="Main deck"
        lines={mainboard}
        zone="mainboard"
        onSwap={onSwap}
        swappingCard={swappingCard}
        onQuantityChange={onQuantityChange}
        onRemove={onRemove}
      />
      <GroupedSection
        title="Sideboard"
        lines={sideboard}
        zone="sideboard"
        onSwap={onSwap}
        swappingCard={swappingCard}
        onQuantityChange={onQuantityChange}
        onRemove={onRemove}
      />

      {(() => {
        const notes = [
          ...new Set([
            ...deck.warnings,
            ...landWarnings,
            ...(validation?.warnings ?? []),
          ]),
        ];
        if (!notes.length) return null;
        return (
          <div className="rounded-2xl border border-amber-800/40 bg-amber-950/25 p-5 text-sm text-amber-100/90 backdrop-blur">
            <p className="mb-2 inline-flex items-center gap-2 font-bold uppercase tracking-[0.2em] text-amber-400/90">
              <span>📝</span> Notes
            </p>
            <ul className="list-inside list-disc space-y-1">
              {notes.map((w, i) => (
                <li key={`${i}-${w}`}>{w}</li>
              ))}
            </ul>
          </div>
        );
      })()}
    </div>
  );
}
