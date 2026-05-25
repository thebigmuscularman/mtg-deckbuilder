"use client";

import { getCardImage, getDisplayName } from "@/lib/scryfall";
import type { BuiltDeck, ScryfallCard } from "@/lib/types";

type EnrichedLine = {
  name: string;
  quantity: number;
  card: ScryfallCard | null;
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

function CardRow({ line }: { line: EnrichedLine }) {
  const image = line.card ? getCardImage(line.card) : undefined;
  const name = line.card ? getDisplayName(line.card) : line.name;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-amber-900/20 bg-stone-900/40 px-3 py-2">
      {image ? (
        <img
          src={image}
          alt={name}
          className="h-14 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-14 w-10 shrink-0 items-center justify-center rounded bg-stone-800 text-xs text-stone-500">
          ?
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-amber-50">
          <span className="text-amber-400">{line.quantity}x</span> {name}
        </p>
        {line.card && (
          <p className="truncate text-xs text-stone-400">{line.card.type_line}</p>
        )}
      </div>
      {line.card?.mana_cost && (
        <span className="font-mono text-sm text-sky-300">{line.card.mana_cost}</span>
      )}
    </li>
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

  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-500/90">
        {title} ({lines.reduce((s, l) => s + l.quantity, 0)} cards)
      </h3>
      <ul className="space-y-2">{sorted.map((line) => <CardRow key={`${line.name}-${line.quantity}`} line={line} />)}</ul>
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
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-amber-100">{deck.name}</h2>
        <p className="text-stone-300">{deck.description}</p>
        {deck.commander && (
          <p className="text-sm text-amber-400/90">
            Commander: <span className="font-semibold">{deck.commander}</span>
          </p>
        )}
        {validation && (
          <div
            className={`rounded-lg px-4 py-2 text-sm ${
              validation.valid
                ? "bg-emerald-950/50 text-emerald-300 ring-1 ring-emerald-800/50"
                : "bg-red-950/50 text-red-300 ring-1 ring-red-800/50"
            }`}
          >
            {validation.valid
              ? "Deck passes format & collection checks"
              : `Issues: ${validation.errors.join("; ")}`}
          </div>
        )}
      </header>

      <div className="rounded-xl bg-stone-950/60 p-4 ring-1 ring-amber-900/30">
        <h3 className="mb-2 text-sm font-semibold text-amber-500">Game plan</h3>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-300">
          {deck.strategy}
        </p>
      </div>

      {enriched?.commander && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-amber-500/90">
            Commander
          </h3>
          <CardRow
            line={{
              name: getDisplayName(enriched.commander),
              quantity: 1,
              card: enriched.commander,
            }}
          />
        </section>
      )}

      <Section title="Main deck" lines={mainboard} />
      <Section title="Sideboard" lines={sideboard} />

      {(deck.warnings.length > 0 || validation?.warnings.length) && (
        <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-4 text-sm text-amber-200/80">
          <p className="mb-1 font-medium text-amber-400">Notes</p>
          <ul className="list-inside list-disc space-y-1">
            {[...deck.warnings, ...(validation?.warnings ?? [])].map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
