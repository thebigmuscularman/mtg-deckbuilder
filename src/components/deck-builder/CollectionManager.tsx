"use client";

import { getDisplayName } from "@/lib/scryfall";
import type { ResolvedCollectionCard } from "@/lib/types";

export function CollectionManager({
  resolved,
  onRemove,
}: {
  resolved: ResolvedCollectionCard[];
  onRemove: (index: number) => void;
}) {
  const playable = resolved.filter((r) => r.card);
  if (playable.length < 2) return null;

  return (
    <details className="glass-panel rounded-2xl p-4">
      <summary className="cursor-pointer text-sm font-semibold text-stone-300">
        Edit collection ({playable.length} resolved cards)
      </summary>
      <p className="mt-2 text-xs text-stone-500">
        Remove cards you sold or do not want in decks. Re-upload anytime for a
        full refresh.
      </p>
      <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm">
        {resolved.map((r, i) => {
          if (!r.card) return null;
          return (
            <li
              key={`${i}-${r.entry.name}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-stone-900/50 px-2 py-1"
            >
              <span className="truncate text-stone-200">
                {r.entry.quantity}x {getDisplayName(r.card)}
              </span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-xs text-rose-400 hover:text-rose-300"
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
