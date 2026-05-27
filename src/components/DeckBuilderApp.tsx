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
type Color = "W" | "U" | "B" | "R" | "G";

const COLOR_META: Record<
  Color,
  { name: string; bg: string; ring: string; text: string; symbol: string }
> = {
  W: { name: "White", bg: "bg-yellow-50", ring: "ring-yellow-200", text: "text-yellow-900", symbol: "☀" },
  U: { name: "Blue", bg: "bg-sky-300", ring: "ring-sky-400", text: "text-sky-950", symbol: "💧" },
  B: { name: "Black", bg: "bg-stone-800", ring: "ring-stone-600", text: "text-stone-100", symbol: "☠" },
  R: { name: "Red", bg: "bg-red-400", ring: "ring-red-500", text: "text-red-950", symbol: "🔥" },
  G: { name: "Green", bg: "bg-green-400", ring: "ring-green-500", text: "text-green-950", symbol: "🌲" },
};

export function DeckBuilderApp() {
  const [step, setStep] = useState<Step>("upload");
  const [format, setFormat] = useState<FormatId>("modern");
  const [strategy, setStrategy] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
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
        body: JSON.stringify({ format, resolved, strategy, colors }),
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
  }, [format, resolved, strategy, colors]);

  const refineDeck = useCallback(async () => {
    if (!deckResult) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/refine-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          resolved,
          deck: deckResult.deck,
          errors: deckResult.validation.errors,
          strategy,
          colors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refine failed");

      setDeckResult({
        deck: data.deck,
        enriched: data.enriched,
        validation: data.validation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refine failed");
    } finally {
      setLoading(false);
    }
  }, [deckResult, format, resolved, strategy, colors]);

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

  const stepIndex = step === "upload" ? 0 : step === "review" ? 1 : 2;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <header className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-700/30 bg-amber-950/30 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.25em] text-amber-400/90 backdrop-blur">
          <span className="mana-pip bg-amber-500/20 text-amber-300" style={{ width: "0.875rem", height: "0.875rem", fontSize: "0.6rem" }}>
            ✦
          </span>
          Powered by Scryfall + AI
        </div>
        <h1 className="shimmer-text text-5xl font-black tracking-tight sm:text-6xl">
          MTG Deckbrewer
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-stone-400 sm:text-lg">
          Upload your collection. Watch AI conjure a legal, playable deck from
          the cards you actually own.
        </p>
      </header>

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

      {error && (
        <div className="fade-in-up mb-6 rounded-xl border border-red-700/40 bg-red-950/50 px-4 py-3 text-sm text-red-200 backdrop-blur">
          {error}
        </div>
      )}

      {step === "upload" && (
        <div className="fade-in-up glass-panel relative overflow-hidden rounded-3xl p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-purple-500/5" />
          <label className="relative block cursor-pointer">
            <input
              type="file"
              accept=".txt,text/plain"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            <span className="inline-flex flex-col items-center gap-5">
              <span
                className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/30 to-amber-700/10 text-4xl ring-2 ring-amber-500/40 ${
                  loading ? "" : "glow-button"
                }`}
              >
                <span className={loading ? "" : "animate-pulse"}>
                  {loading ? "✦" : "📜"}
                </span>
                {loading && (
                  <span
                    className="absolute inset-0 rounded-full border-2 border-amber-400/60 border-t-transparent"
                    style={{ animation: "spinSlow 1.2s linear infinite" }}
                  />
                )}
              </span>
              <span className="text-xl font-semibold text-amber-50">
                {loading ? "Consulting Scryfall…" : "Upload your collection (.txt)"}
              </span>
              <span className="max-w-md text-sm leading-relaxed text-stone-400">
                Plain text, one card per line:{" "}
                <code className="rounded bg-stone-800/80 px-2 py-0.5 text-amber-300/90 ring-1 ring-amber-900/40">
                  4 Lightning Bolt
                </code>
                <br />
                Or grab{" "}
                <a
                  href="/sample-collection.txt"
                  className="font-medium text-amber-400 underline decoration-amber-700/60 underline-offset-4 hover:text-amber-300 hover:decoration-amber-500"
                  download
                  onClick={(e) => e.stopPropagation()}
                >
                  a sample file
                </a>{" "}
                to try it.
              </span>
            </span>
          </label>
        </div>
      )}

      {step === "review" && summary && (
        <div className="fade-in-up space-y-6">
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
            <details className="glass-panel overflow-hidden rounded-2xl text-sm">
              <summary className="cursor-pointer px-5 py-3 font-medium text-amber-300/90 hover:text-amber-200">
                {summary.unresolved} card{summary.unresolved === 1 ? "" : "s"} couldn’t be found on Scryfall
              </summary>
              <div className="max-h-48 overflow-y-auto border-t border-stone-800 bg-stone-950/60 p-4 text-stone-400">
                {resolved
                  .filter((r) => !r.card)
                  .map((r) => (
                    <p key={r.entry.name} className="font-mono text-xs">
                      ? {r.entry.quantity}x {r.entry.name}
                    </p>
                  ))}
              </div>
            </details>
          )}

          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
              Format
            </label>
            <div className="mb-2 flex flex-wrap gap-2">
              {(Object.keys(FORMATS) as FormatId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFormat(id)}
                  className={`card-hover rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
                    format === id
                      ? "bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-lg shadow-amber-700/40 ring-1 ring-amber-300/40"
                      : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60 hover:bg-stone-700/80 hover:text-amber-100"
                  }`}
                >
                  {FORMATS[id].label}
                </button>
              ))}
            </div>
            <p className="mb-6 text-xs italic text-stone-500">
              {FORMATS[format].description}
            </p>

            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
              <span>
                Color combo <span className="text-stone-600">(optional)</span>
              </span>
              {colors.length > 0 && (
                <button
                  type="button"
                  onClick={() => setColors([])}
                  className="text-[0.65rem] font-normal normal-case tracking-normal text-stone-500 hover:text-amber-300"
                >
                  Clear
                </button>
              )}
            </div>
            <fieldset className="mb-2">
              <legend className="sr-only">Pick the colors you want in the deck</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(Object.keys(COLOR_META) as Color[]).map((c) => {
                  const meta = COLOR_META[c];
                  const active = colors.includes(c);
                  const id = `color-${c}`;
                  return (
                    <label
                      key={c}
                      htmlFor={id}
                      className={`card-hover flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        active
                          ? `${meta.bg} ${meta.text} shadow-lg ring-2 ${meta.ring}`
                          : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60 hover:bg-stone-700/80 hover:text-stone-100"
                      }`}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={active}
                        onChange={() =>
                          setColors((prev) =>
                            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                          )
                        }
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition ${
                          active
                            ? "border-black/40 bg-black/20 text-current"
                            : "border-stone-500 bg-stone-900/60 text-transparent"
                        }`}
                      >
                        ✓
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                          active ? "bg-black/10" : "bg-stone-700/60"
                        }`}
                      >
                        {meta.symbol}
                      </span>
                      <span className="flex-1">{meta.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <p className="mb-6 text-xs italic text-stone-500">
              {colors.length === 0
                ? "Tick none to let the AI choose any colors that fit your collection."
                : format === "commander"
                ? `Commander must have exactly these ${colors.length} color${colors.length === 1 ? "" : "s"} in its identity.`
                : `Deck will be limited to these ${colors.length} color${colors.length === 1 ? "" : "s"}.`}
            </p>

            <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
              Strategy <span className="text-stone-600">(optional)</span>
            </label>
            <input
              type="text"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
              placeholder="e.g. aggro red, esper control, tokens…"
              className="mb-7 w-full rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-600/40"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={loading || summary.unique < 10}
                onClick={() => void buildDeck()}
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 px-7 py-3 font-bold text-stone-950 shadow-xl shadow-amber-700/40 transition hover:from-amber-300 hover:to-amber-500 disabled:cursor-not-allowed disabled:opacity-50 ${
                  loading ? "" : "glow-button"
                }`}
              >
                <span className="text-lg">{loading ? "✦" : "⚡"}</span>
                {loading ? "Brewing deck…" : "Build my deck"}
                <span className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-white/30 to-transparent opacity-0 transition group-hover:opacity-100 group-hover:[transform:translateX(100%)]" />
              </button>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="rounded-xl px-4 py-2.5 text-sm text-stone-400 transition hover:text-amber-300"
              >
                ← Upload different file
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "deck" && deckResult && (
        <div className="fade-in-up space-y-6">
          {!deckResult.validation.valid && (
            <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-gradient-to-br from-red-950/70 via-red-950/50 to-stone-950/70 p-6 shadow-2xl shadow-red-950/40 backdrop-blur">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/60 to-transparent" />
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/30 text-xl font-bold text-red-200 ring-2 ring-red-400/40">
                    ⚠
                  </span>
                  <div>
                    <p className="text-lg font-bold text-red-50">
                      {deckResult.validation.errors.length} issue
                      {deckResult.validation.errors.length === 1 ? "" : "s"} in
                      this deck
                    </p>
                    <p className="text-sm text-red-200/80">
                      The AI can fix these automatically while keeping the same
                      game plan.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void refineDeck()}
                  className="group relative shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-red-500 to-red-600 px-6 py-3.5 text-base font-bold text-white shadow-xl shadow-red-900/60 transition hover:from-red-400 hover:to-red-500 disabled:opacity-50 sm:text-lg"
                >
                  <span className="mr-1">{loading ? "✦" : "🪄"}</span>
                  {loading ? "Fixing…" : "Fix errors with AI"}
                </button>
              </div>
              <details className="mt-4 cursor-pointer text-xs text-red-200/70">
                <summary className="font-medium hover:text-red-200">
                  See the {deckResult.validation.errors.length} issue
                  {deckResult.validation.errors.length === 1 ? "" : "s"}
                </summary>
                <ul className="mt-2 list-inside list-disc space-y-1 pl-2">
                  {deckResult.validation.errors.map((e, i) => (
                    <li key={`${i}-${e}`}>{e}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadDeck}
              className="card-hover inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 px-5 py-2.5 text-sm font-semibold text-amber-200 ring-1 ring-amber-600/40 hover:from-amber-500/30 hover:to-amber-700/20"
            >
              <span>⬇</span> Download decklist
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("review");
                setDeckResult(null);
              }}
              className="rounded-xl px-4 py-2.5 text-sm text-stone-400 hover:text-amber-300"
            >
              ↻ Brew another
            </button>
          </div>
          <DeckDisplay
            deck={deckResult.deck}
            enriched={deckResult.enriched}
            validation={deckResult.validation}
          />
        </div>
      )}

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
      className={`card-hover relative overflow-hidden rounded-2xl p-5 ring-1 ${
        warn
          ? "bg-gradient-to-br from-amber-950/50 to-stone-950/80 ring-amber-700/40"
          : "bg-gradient-to-br from-stone-900/80 to-stone-950/80 ring-stone-800/60"
      }`}
    >
      <div
        className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl ${
          warn ? "bg-amber-500/20" : "bg-amber-500/5"
        }`}
      />
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
        {label}
      </p>
      <p
        className={`mt-1 text-3xl font-black tabular-nums ${
          warn ? "text-amber-300" : "text-amber-100"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
