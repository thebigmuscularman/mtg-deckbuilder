"use client";

import { getCardImage, getDisplayName } from "@/lib/scryfall";
import type { BuiltDeck, ScryfallCard } from "@/lib/types";

type EnrichedLine = {
  name: string;
  quantity: number;
  card: ScryfallCard | null;
  reason?: string;
};

interface DeckDisplayProps {
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
}

const MANA_COLORS: Record<string, string> = {
  W: "bg-yellow-50 text-yellow-900",
  U: "bg-sky-300 text-sky-950",
  B: "bg-stone-800 text-stone-100 ring-1 ring-stone-600",
  R: "bg-red-400 text-red-950",
  G: "bg-green-400 text-green-950",
  C: "bg-stone-500 text-stone-50",
};

function formatManaCost(cost?: string) {
  if (!cost) return null;
  const symbols = cost.match(/\{[^}]+\}/g) ?? [];
  return (
    <span className="flex flex-wrap items-center gap-0.5">
      {symbols.map((sym, i) => {
        const inner = sym.slice(1, -1);
        const colorKey = inner.length === 1 && MANA_COLORS[inner] ? inner : "C";
        const isNumber = /^\d+$/.test(inner);
        return (
          <span
            key={i}
            className={`mana-pip ${
              isNumber ? "bg-stone-700 text-stone-100" : MANA_COLORS[colorKey] ?? "bg-stone-700 text-stone-100"
            }`}
            style={{ width: "1.25rem", height: "1.25rem", fontSize: "0.7rem" }}
            title={inner}
          >
            {inner}
          </span>
        );
      })}
    </span>
  );
}

function CardRow({ line }: { line: EnrichedLine }) {
  const image = line.card ? getCardImage(line.card) : undefined;
  const name = line.card ? getDisplayName(line.card) : line.name;

  return (
    <li className="card-hover group flex gap-3 rounded-xl border border-stone-800/80 bg-gradient-to-br from-stone-900/70 to-stone-950/70 px-3 py-2.5 backdrop-blur">
      {image ? (
        <div className="relative shrink-0 overflow-hidden rounded-lg ring-1 ring-stone-700/60 transition group-hover:ring-amber-500/40">
          <img
            src={image}
            alt={name}
            className="h-24 w-[68px] object-cover transition group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="flex h-24 w-[68px] shrink-0 items-center justify-center rounded-lg bg-stone-800 text-xs text-stone-500 ring-1 ring-stone-700/60">
          ?
        </div>
      )}
      <div className="min-w-0 flex-1">
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
        {line.card && (
          <p className="truncate text-xs italic text-stone-400">
            {line.card.type_line}
          </p>
        )}
        {line.reason && (
          <p className="mt-1.5 text-xs leading-relaxed text-stone-300/85">
            <span className="font-semibold text-amber-500/90">Why:</span>{" "}
            {line.reason}
          </p>
        )}
      </div>
    </li>
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

function Section({
  title,
  lines,
}: {
  title: string;
  lines: EnrichedLine[];
}) {
  if (!lines.length) return null;
  const sorted = [...lines].sort((a, b) => a.name.localeCompare(b.name));
  const total = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <section>
      <SectionHeader title={title} count={total} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((line, i) => (
          <CardRow key={`${line.name}-${i}`} line={line} />
        ))}
      </ul>
    </section>
  );
}

export function DeckDisplay({ deck, enriched, validation }: DeckDisplayProps) {
  const mainboard: EnrichedLine[] =
    enriched?.mainboard ??
    deck.mainboard.map((l) => ({ ...l, card: null }));
  const sideboard: EnrichedLine[] =
    enriched?.sideboard ??
    deck.sideboard.map((l) => ({ ...l, card: null }));

  return (
    <div className="space-y-10">
      <header className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="relative">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-amber-500/80">
            Brewed deck
          </p>
          <h2 className="shimmer-text text-3xl font-black tracking-tight sm:text-4xl">
            {deck.name}
          </h2>
          <p className="mt-3 text-stone-300/90 sm:text-lg">{deck.description}</p>
          {deck.commander && (
            <p className="mt-3 text-sm text-amber-300/90">
              <span className="font-semibold uppercase tracking-[0.15em] text-amber-500/80">
                Commander:
              </span>{" "}
              <span className="font-semibold text-amber-100">{deck.commander}</span>
            </p>
          )}
          {validation?.valid && (
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-emerald-700/40 bg-emerald-950/50 px-4 py-1.5 text-sm font-medium text-emerald-300">
              <span className="text-base">✓</span>
              Legal & playable from your collection
            </div>
          )}
        </div>
      </header>

      <div className="glass-panel relative overflow-hidden rounded-2xl p-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
        <h3 className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
          <span className="text-lg">⚔</span> Game plan
        </h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-200/90 sm:text-base">
          {deck.strategy}
        </p>
      </div>

      {enriched?.commander && (
        <section>
          <SectionHeader title="Commander" count={1} />
          <CardRow
            line={{
              name: getDisplayName(enriched.commander),
              quantity: 1,
              card: enriched.commander,
              reason: deck.commanderReason,
            }}
          />
        </section>
      )}

      <Section title="Main deck" lines={mainboard} />
      <Section title="Sideboard" lines={sideboard} />

      {(() => {
        const notes = [
          ...new Set([...deck.warnings, ...(validation?.warnings ?? [])]),
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
