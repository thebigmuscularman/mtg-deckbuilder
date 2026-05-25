"use client";

import { useCallback, useState } from "react";
import { FORMATS } from "@/lib/formats";
import type {
  BuiltDeck,
  FormatId,
  ResolvedCollectionCard,
  ScryfallCard,
} from "@/lib/types";
import { DeckDisplay } from "./DeckDisplay";

type Step = "upload" | "review" | "deck";

export function DeckBuilderApp() {
  const [step, setStep] = useState<Step>("upload");
  const [format, setFormat] = useState<FormatId>("modern");
  const [strategy, setStrategy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<ResolvedCollectionCard[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    unique: number;
    unresolved: number;
  } | null>(null);
  const [deckResult, setDeckResult] = useState<{
    deck: BuiltDeck;
    enriched: {
      mainboard: Array<{ name: string; quantity: number; card: ScryfallCard | null }>;
      sideboard: Array<{ name: string; quantity: number; card: ScryfallCard | null }>;
      commander: ScryfallCard | null;
    };
    validation: { valid: boolean; errors: string[]; warnings: string[] };
  } | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/resolve-collection", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setResolved(data.resolved);
      setSummary({
        total: data.summary.totalEntries,
        unique: data.uniqueCount,
        unresolved: data.summary.unresolved.length,
      });
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const buildDeck = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/build-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, resolved, strategy }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Build failed");

      setDeckResult({
        deck: data.deck,
        enriched: data.enriched,
        validation: data.validation,
      });
      setStep("deck");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setLoading(false);
    }
  }, [format, resolved, strategy]);

  const downloadDeck = useCallback(() => {
    if (!deckResult) return;
    const { deck } = deckResult;
    const lines: string[] = [
      `# ${deck.name}`,
      `# ${deck.description}`,
      "",
    ];
    if (deck.commander) lines.push(`Commander\n1 ${deck.commander}\n`);
    lines.push("Maindeck");
    for (const c of deck.mainboard) lines.push(`${c.quantity} ${c.name}`);
    if (deck.sideboard.length) {
      lines.push("\nSideboard");
      for (const c of deck.sideboard) lines.push(`${c.quantity} ${c.name}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${deck.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [deckResult]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-10 text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-amber-600">
          Powered by Scryfall
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-amber-50">
          MTG Deckbrewer
        </h1>
        <p className="mt-3 text-stone-400">
          Upload your collection. AI builds a legal, playable deck from cards you
          actually own.
        </p>
      </header>

      <div className="mb-8 flex justify-center gap-2 text-sm">
        {(["upload", "review", "deck"] as Step[]).map((s, i) => (
          <span
            key={s}
            className={`rounded-full px-3 py-1 ${
              step === s
                ? "bg-amber-600/30 text-amber-200 ring-1 ring-amber-500/50"
                : "text-stone-500"
            }`}
          >
            {i + 1}. {s === "upload" ? "Collection" : s === "review" ? "Review" : "Deck"}
          </span>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-200 ring-1 ring-red-800/50">
          {error}
        </div>
      )}

      {step === "upload" && (
        <div className="rounded-2xl border border-dashed border-amber-800/40 bg-stone-900/50 p-10 text-center">
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".csv,.txt,.tsv"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <span className="inline-flex flex-col items-center gap-4">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-600/20 text-3xl ring-2 ring-amber-500/30">
                📜
              </span>
              <span className="text-lg font-medium text-amber-100">
                {loading ? "Resolving on Scryfall…" : "Upload collection CSV"}
              </span>
              <span className="max-w-md text-sm text-stone-400">
                One card per line:{" "}
                <code className="rounded bg-stone-800 px-1.5 py-0.5 text-amber-300/90">
                  4 Lightning Bolt
                </code>{" "}
                or{" "}
                <code className="rounded bg-stone-800 px-1.5 py-0.5 text-amber-300/90">
                  name,quantity
                </code>
              </span>
            </span>
          </label>
        </div>
      )}

      {step === "review" && summary && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Lines" value={summary.total} />
            <Stat label="Unique cards" value={summary.unique} />
            <Stat
              label="Unresolved"
              value={summary.unresolved}
              warn={summary.unresolved > 0}
            />
          </div>

          {summary.unresolved > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg bg-stone-900/60 p-4 text-sm text-stone-400">
              {resolved
                .filter((r) => !r.card)
                .map((r) => (
                  <p key={r.entry.name}>
                    ? {r.entry.quantity}x {r.entry.name}
                  </p>
                ))}
            </div>
          )}

          <div className="rounded-xl bg-stone-900/60 p-6 ring-1 ring-amber-900/30">
            <label className="mb-2 block text-sm font-medium text-amber-400">
              Format
            </label>
            <div className="mb-6 flex flex-wrap gap-2">
              {(Object.keys(FORMATS) as FormatId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFormat(id)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    format === id
                      ? "bg-amber-600 text-stone-950"
                      : "bg-stone-800 text-stone-300 hover:bg-stone-700"
                  }`}
                >
                  {FORMATS[id].label}
                </button>
              ))}
            </div>
            <p className="mb-4 text-xs text-stone-500">{FORMATS[format].description}</p>

            <label className="mb-2 block text-sm font-medium text-amber-400">
              Strategy (optional)
            </label>
            <input
              type="text"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              placeholder="e.g. aggro red, esper control, tokens…"
              className="mb-6 w-full rounded-lg border border-stone-700 bg-stone-950 px-4 py-2 text-stone-100 placeholder:text-stone-600 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
            />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={loading || summary.unique < 10}
                onClick={() => void buildDeck()}
                className="rounded-lg bg-amber-600 px-6 py-2.5 font-semibold text-stone-950 transition hover:bg-amber-500 disabled:opacity-50"
              >
                {loading ? "Brewing deck…" : "Build my deck"}
              </button>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="rounded-lg px-4 py-2.5 text-stone-400 hover:text-stone-200"
              >
                Upload different file
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "deck" && deckResult && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadDeck}
              className="rounded-lg bg-amber-600/20 px-4 py-2 text-sm font-medium text-amber-200 ring-1 ring-amber-600/40 hover:bg-amber-600/30"
            >
              Download decklist
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("review");
                setDeckResult(null);
              }}
              className="rounded-lg px-4 py-2 text-sm text-stone-400 hover:text-stone-200"
            >
              Brew another
            </button>
          </div>
          <DeckDisplay
            deck={deckResult.deck}
            enriched={deckResult.enriched}
            validation={deckResult.validation}
          />
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-stone-600">
        Card data from{" "}
        <a
          href="https://scryfall.com"
          className="text-amber-700/80 hover:text-amber-600"
          target="_blank"
          rel="noreferrer"
        >
          Scryfall
        </a>
        . Not affiliated with Wizards of the Coast.
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        warn
          ? "bg-amber-950/30 ring-amber-800/40"
          : "bg-stone-900/60 ring-stone-800/50"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-stone-500">{label}</p>
      <p
        className={`text-2xl font-bold ${warn ? "text-amber-400" : "text-amber-100"}`}
      >
        {value}
      </p>
    </div>
  );
}
