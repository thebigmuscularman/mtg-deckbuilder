"use client";

import type { SavedDeckEntry } from "@/lib/storage";
import type { Step } from "./types";

export function AppHeader({
  theme,
  onToggleTheme,
  onToggleHistory,
  historyCount,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  onToggleHistory: () => void;
  historyCount: number;
}) {
  return (
    <header className="mb-12 text-center">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/30 bg-amber-950/30 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-amber-400/90 backdrop-blur">
          <span
            className="mana-pip bg-amber-500/20 text-amber-300"
            style={{ width: "0.875rem", height: "0.875rem", fontSize: "0.6rem" }}
          >
            ✦
          </span>
          Powered by Scryfall + AI
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-full border border-stone-700/60 bg-stone-900/60 px-3 py-1.5 text-xs text-stone-400 hover:text-amber-300"
        >
          {theme === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
        <button
          type="button"
          onClick={onToggleHistory}
          className="rounded-full border border-stone-700/60 bg-stone-900/60 px-3 py-1.5 text-xs text-stone-400 hover:text-amber-300"
        >
          History ({historyCount})
        </button>
      </div>
      <h1 className="shimmer-text text-5xl font-black tracking-tight sm:text-6xl">
        MTG Deckbrewer
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-base text-stone-400 sm:text-lg">
        Upload your collection. Watch AI conjure a legal, playable deck from the cards you
        actually own.
      </p>
    </header>
  );
}

export function StepIndicator({ step }: { step: Step }) {
  const stepIndex = step === "upload" ? 0 : step === "review" ? 1 : 2;
  return (
    <div className="mb-10 flex items-center justify-center gap-3 sm:gap-5">
      {(["upload", "review", "deck"] as Step[]).map((s, i) => {
        const active = step === s;
        const done = i < stepIndex;
        const label = s === "upload" ? "Collection" : s === "review" ? "Brew" : "Deck";
        return (
          <div key={s} className="flex items-center gap-3 sm:gap-5">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  active
                    ? "bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-lg shadow-amber-500/40 ring-2 ring-amber-300/40"
                    : done
                      ? "bg-amber-900/50 text-amber-300 ring-1 ring-amber-700/40"
                      : "bg-stone-900 text-stone-600 ring-1 ring-stone-800"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  active ? "text-amber-200" : done ? "text-stone-400" : "text-stone-600"
                }`}
              >
                {label}
              </span>
            </div>
            {i < 2 && (
              <span
                className={`h-px w-8 sm:w-16 ${
                  done ? "bg-gradient-to-r from-amber-600 to-amber-700/30" : "bg-stone-800"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function HistorySidebar({
  history,
  onOpen,
}: {
  history: SavedDeckEntry[];
  onOpen: (entry: SavedDeckEntry) => void;
}) {
  if (!history.length) return null;
  return (
    <div className="fade-in-up glass-panel mb-6 rounded-2xl p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">
        Recent brews (saved on this device)
      </p>
      <ul className="space-y-1 text-sm">
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className="text-left text-stone-300 hover:text-amber-300"
              onClick={() => onOpen(entry)}
            >
              {entry.label}{" "}
              <span className="text-stone-500">
                · {new Date(entry.savedAt).toLocaleDateString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-20 border-t border-stone-800/60 pt-8 text-center text-xs text-stone-600">
      Card data from{" "}
      <a
        href="https://scryfall.com"
        className="text-amber-700/80 hover:text-amber-600"
        target="_blank"
        rel="noreferrer"
      >
        Scryfall
      </a>
      . Mana symbols by{" "}
      <a
        href="https://mana.andrewgioia.com"
        className="text-amber-700/80 hover:text-amber-600"
        target="_blank"
        rel="noreferrer"
      >
        Mana font
      </a>
      . Not affiliated with Wizards of the Coast.
    </footer>
  );
}

export function StreamingStatus({
  status,
  preview,
}: {
  status: string;
  preview: string;
}) {
  if (!status) return null;
  return (
    <div className="fade-in-up mb-6 glass-panel rounded-xl p-4 text-sm">
      <p className="font-medium text-amber-300">{status}</p>
      {preview && (
        <pre className="mt-2 max-h-24 overflow-auto text-[0.65rem] text-stone-500">
          {preview}
        </pre>
      )}
    </div>
  );
}
