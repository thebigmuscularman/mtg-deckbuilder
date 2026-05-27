"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_HOUSE_RULES,
  type HouseRules,
} from "@/lib/deck-preferences";
import {
  DEFAULT_POWER_LEVEL,
  isPowerLevelId,
  type PowerLevelId,
} from "@/lib/power-levels";
import { collectionEstimatedValue } from "@/lib/prices";
import {
  loadCollection,
  loadDeckHistory,
  loadPrefs,
  pushDeckHistory,
  saveCollection,
  savePrefs,
  type SavedDeckEntry,
} from "@/lib/storage";
import type {
  BuiltDeck,
  FormatId,
  ResolvedCollectionCard,
} from "@/lib/types";
import { validateDeck } from "@/lib/deck-validation";
import { exportDeck } from "@/lib/export-formats";
import { nameKey } from "@/lib/scryfall";
import { DeckDisplay } from "./DeckDisplay";
import { ReviewStep } from "./deck-builder/ReviewStep";
import { UploadStep } from "./deck-builder/UploadStep";
import {
  BUILD_VARIANTS,
  parseSseChunk,
  type Color,
  type DeckResult,
  type Step,
  type UploadMode,
} from "./deck-builder/types";

export function DeckBuilderApp() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [uploadMode, setUploadMode] = useState<UploadMode>("file");
  const [pasteText, setPasteText] = useState("");
  const [format, setFormat] = useState<FormatId>("modern");
  const [strategy, setStrategy] = useState("");
  const [colors, setColors] = useState<Color[]>([]);
  const [budgetMax, setBudgetMax] = useState<number>(0);
  const [powerLevel, setPowerLevel] =
    useState<PowerLevelId>(DEFAULT_POWER_LEVEL);
  const [avoidList, setAvoidList] = useState("");
  const [houseRules, setHouseRules] = useState<HouseRules>(DEFAULT_HOUSE_RULES);
  const [politicsFriendly, setPoliticsFriendly] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState("");
  const [streamPreview, setStreamPreview] = useState("");
  const [resolved, setResolved] = useState<ResolvedCollectionCard[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    unique: number;
    unresolved: number;
  } | null>(null);
  const [deckTabs, setDeckTabs] = useState<Array<{ label: string; result: DeckResult }>>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [swappingCard, setSwappingCard] = useState<string | null>(null);
  const [deckHistory, setDeckHistory] = useState<SavedDeckEntry[]>(() =>
    loadDeckHistory(),
  );
  const [showHistory, setShowHistory] = useState(false);

  const activeResult = deckTabs[activeTab]?.result ?? null;

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- restore prefs/collection from localStorage */
    const prefs = loadPrefs();
    if (prefs.format) setFormat(prefs.format);
    if (prefs.colors?.length) setColors(prefs.colors as Color[]);
    if (prefs.strategy) setStrategy(prefs.strategy);
    if (prefs.budgetMax) setBudgetMax(prefs.budgetMax);
    if (isPowerLevelId(prefs.powerLevel)) setPowerLevel(prefs.powerLevel);
    if (prefs.avoidList !== undefined) setAvoidList(prefs.avoidList);
    if (prefs.houseRules) setHouseRules(prefs.houseRules);
    if (prefs.politicsFriendly) setPoliticsFriendly(prefs.politicsFriendly);
    if (prefs.theme) setTheme(prefs.theme);
    const saved = loadCollection();
    if (saved) {
      setResolved(saved.resolved);
      setSummary(saved.summary);
      setStep("review");
    }
    setDeckHistory(loadDeckHistory());
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    savePrefs({
      format,
      colors,
      strategy,
      budgetMax,
      powerLevel,
      theme,
      avoidList,
      houseRules,
      politicsFriendly,
    });
  }, [
    hydrated,
    format,
    colors,
    strategy,
    budgetMax,
    powerLevel,
    theme,
    avoidList,
    houseRules,
    politicsFriendly,
  ]);

  const collectionValue = useMemo(
    () =>
      collectionEstimatedValue(
        resolved.map((r) => ({ card: r.card, quantity: r.entry.quantity })),
      ),
    [resolved],
  );

  const applyResolved = useCallback(
    (data: {
      resolved: ResolvedCollectionCard[];
      summary: { totalEntries: number; unresolved: unknown[] };
      uniqueCount: number;
    }) => {
      setResolved(data.resolved);
      const sum = {
        total: data.summary.totalEntries,
        unique: data.uniqueCount,
        unresolved: Array.isArray(data.summary.unresolved)
          ? data.summary.unresolved.length
          : 0,
      };
      setSummary(sum);
      saveCollection({
        resolved: data.resolved,
        summary: sum,
        savedAt: new Date().toISOString(),
      });
      setStep("review");
    },
    [],
  );

  const resolveCollection = useCallback(
    async (text: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/resolve-collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        applyResolved(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [applyResolved],
  );

  const handleFile = useCallback(
    async (file: File) => {
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
        applyResolved(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setLoading(false);
      }
    },
    [applyResolved],
  );

  const buildPayload = useCallback(
    () => ({
      format,
      resolved,
      strategy,
      colors,
      budgetMax: budgetMax > 0 ? budgetMax : undefined,
      powerLevel,
      avoidList: avoidList.trim() || undefined,
      houseRules,
      politicsFriendly: format === "commander" ? politicsFriendly : undefined,
    }),
    [
      format,
      resolved,
      strategy,
      colors,
      budgetMax,
      powerLevel,
      avoidList,
      houseRules,
      politicsFriendly,
    ],
  );

  const applyDeckResult = useCallback((label: string, data: DeckResult) => {
    setDeckTabs((prev) => {
      const next = [...prev, { label, result: data }];
      setActiveTab(next.length - 1);
      return next;
    });
    pushDeckHistory(data.deck);
    setDeckHistory(loadDeckHistory());
    setStep("deck");
  }, []);

  const buildDeckStream = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamStatus("Connecting…");
    setStreamPreview("");
    setDeckTabs([]);

    try {
      const res = await fetch("/api/build-deck-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Build failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseChunk(buffer);
        buffer = rest;

        for (const { event, data } of events) {
          if (event === "progress") {
            const parsed = JSON.parse(data) as {
              type?: string;
              message?: string;
              delta?: string;
            };
            if (parsed.type === "status" && parsed.message) {
              setStreamStatus(parsed.message);
            }
            if (parsed.type === "token" && parsed.delta) {
              setStreamPreview((p) => (p + parsed.delta!).slice(-800));
            }
          } else if (event === "done") {
            const payload = JSON.parse(data);
            applyDeckResult(payload.deck?.archetype ?? "Deck", {
              deck: payload.deck,
              enriched: payload.enriched,
              validation: payload.validation,
            });
          } else if (event === "error") {
            const payload = JSON.parse(data);
            throw new Error(payload.error ?? "Build failed");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setLoading(false);
      setStreamStatus("");
      setStreamPreview("");
    }
  }, [buildPayload, applyDeckResult]);

  const buildDeck = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDeckTabs([]);
    try {
      const res = await fetch("/api/build-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Build failed");
      applyDeckResult(data.deck?.archetype ?? "Deck", {
        deck: data.deck,
        enriched: data.enriched,
        validation: data.validation,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setLoading(false);
    }
  }, [buildPayload, applyDeckResult]);

  const buildThreeDecks = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDeckTabs([]);
    try {
      const results = await Promise.all(
        BUILD_VARIANTS.map(async (variant) => {
          const res = await fetch("/api/build-deck", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...buildPayload(),
              strategy: [strategy, variant.hint].filter(Boolean).join(" — "),
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `${variant.label} build failed`);
          return {
            label: variant.label,
            result: {
              deck: data.deck,
              enriched: data.enriched,
              validation: data.validation,
            } as DeckResult,
          };
        }),
      );
      setDeckTabs(results);
      setActiveTab(0);
      for (const r of results) pushDeckHistory(r.result.deck);
      setDeckHistory(loadDeckHistory());
      setStep("deck");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Build failed");
    } finally {
      setLoading(false);
    }
  }, [buildPayload, strategy]);

  const refineDeck = useCallback(async () => {
    if (!activeResult) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/refine-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          deck: activeResult.deck,
          errors: activeResult.validation.errors,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refine failed");
      const updated: DeckResult = {
        deck: data.deck,
        enriched: data.enriched,
        validation: data.validation,
      };
      setDeckTabs((tabs) =>
        tabs.map((t, i) => (i === activeTab ? { ...t, result: updated } : t)),
      );
      pushDeckHistory(data.deck);
      setDeckHistory(loadDeckHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refine failed");
    } finally {
      setLoading(false);
    }
  }, [activeResult, activeTab, buildPayload]);

  const shoreUpDeck = useCallback(async () => {
    if (!activeResult) return;
    const weaknesses = activeResult.deck.weaknesses?.filter(
      (w) => w.trim().length > 0,
    );
    if (!weaknesses?.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/shore-up-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload(),
          deck: activeResult.deck,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Shore-up failed");
      const updated: DeckResult = {
        deck: data.deck,
        enriched: data.enriched,
        validation: data.validation,
      };
      setDeckTabs((tabs) =>
        tabs.map((t, i) => (i === activeTab ? { ...t, result: updated } : t)),
      );
      pushDeckHistory(data.deck);
      setDeckHistory(loadDeckHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shore-up failed");
    } finally {
      setLoading(false);
    }
  }, [activeResult, activeTab, buildPayload]);

  const swapCard = useCallback(
    async (cardName: string, zone: "mainboard" | "sideboard" | "commander") => {
      if (!activeResult) return;
      setSwappingCard(cardName);
      setError(null);
      try {
        const res = await fetch("/api/swap-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildPayload(),
            deck: activeResult.deck,
            cardName,
            zone,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Swap failed");
        const updated: DeckResult = {
          deck: data.deck,
          enriched: data.enriched,
          validation: data.validation,
        };
        setDeckTabs((tabs) =>
          tabs.map((t, i) => (i === activeTab ? { ...t, result: updated } : t)),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Swap failed");
      } finally {
        setSwappingCard(null);
      }
    },
    [activeResult, activeTab, buildPayload],
  );

  const playableResolved = useMemo(
    () => resolved.filter((r) => r.card) as ResolvedCollectionCard[],
    [resolved],
  );

  const revalidateDeckResult = useCallback(
    (deck: BuiltDeck): DeckResult => {
      const validation = validateDeck(deck, playableResolved);
      return {
        deck,
        validation: {
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
        },
        enriched: {
          mainboard: validation.enrichedMainboard,
          sideboard: validation.enrichedSideboard,
          commander: validation.commanderCard,
        },
      };
    },
    [playableResolved],
  );

  const patchActiveDeck = useCallback(
    (mutate: (deck: BuiltDeck) => BuiltDeck) => {
      setDeckTabs((tabs) =>
        tabs.map((t, i) => {
          if (i !== activeTab) return t;
          const deck = mutate(t.result.deck);
          return { ...t, result: revalidateDeckResult(deck) };
        }),
      );
    },
    [activeTab, revalidateDeckResult],
  );

  const setCardQuantity = useCallback(
    (
      cardName: string,
      zone: "mainboard" | "sideboard" | "commander",
      quantity: number,
    ) => {
      const key = nameKey(cardName);
      patchActiveDeck((deck) => {
        if (zone === "commander") return deck;
        const list = zone === "mainboard" ? [...deck.mainboard] : [...deck.sideboard];
        const idx = list.findIndex((l) => nameKey(l.name) === key);
        if (idx < 0) return deck;
        if (quantity <= 0) {
          list.splice(idx, 1);
        } else {
          list[idx] = { ...list[idx], quantity };
        }
        return zone === "mainboard"
          ? { ...deck, mainboard: list }
          : { ...deck, sideboard: list };
      });
    },
    [patchActiveDeck],
  );

  const removeCard = useCallback(
    (cardName: string, zone: "mainboard" | "sideboard" | "commander") => {
      const key = nameKey(cardName);
      patchActiveDeck((deck) => {
        if (zone === "commander") {
          return { ...deck, commander: null, commanderReason: undefined };
        }
        const list =
          zone === "mainboard" ? deck.mainboard : deck.sideboard;
        const filtered = list.filter((l) => nameKey(l.name) !== key);
        return zone === "mainboard"
          ? { ...deck, mainboard: filtered }
          : { ...deck, sideboard: filtered };
      });
    },
    [patchActiveDeck],
  );

  const downloadDeck = useCallback(() => {
    if (!activeResult) return;
    const text = exportDeck(activeResult.deck, "plain");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeResult.deck.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeResult]);

  const stepIndex = step === "upload" ? 0 : step === "review" ? 1 : 2;

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-amber-400/80">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
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
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="rounded-full border border-stone-700/60 bg-stone-900/60 px-3 py-1.5 text-xs text-stone-400 hover:text-amber-300"
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="rounded-full border border-stone-700/60 bg-stone-900/60 px-3 py-1.5 text-xs text-stone-400 hover:text-amber-300"
          >
            History ({deckHistory.length})
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

      {showHistory && deckHistory.length > 0 && (
        <div className="fade-in-up glass-panel mb-6 rounded-2xl p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            Recent brews (saved on this device)
          </p>
          <ul className="space-y-1 text-sm">
            {deckHistory.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="text-left text-stone-300 hover:text-amber-300"
                  onClick={() => {
                    setDeckTabs([
                      {
                        label: entry.label,
                        result: {
                          deck: entry.deck,
                          enriched: {
                            mainboard: entry.deck.mainboard.map((l) => ({
                              ...l,
                              card: null,
                            })),
                            sideboard: entry.deck.sideboard.map((l) => ({
                              ...l,
                              card: null,
                            })),
                            commander: null,
                          },
                          validation: {
                            valid: true,
                            errors: [],
                            warnings: entry.deck.warnings,
                          },
                        },
                      },
                    ]);
                    setActiveTab(0);
                    setStep("deck");
                    setShowHistory(false);
                  }}
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
      )}

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

      {loading && streamStatus && (
        <div className="fade-in-up mb-6 glass-panel rounded-xl p-4 text-sm">
          <p className="font-medium text-amber-300">{streamStatus}</p>
          {streamPreview && (
            <pre className="mt-2 max-h-24 overflow-auto text-[0.65rem] text-stone-500">
              {streamPreview}
            </pre>
          )}
        </div>
      )}

      {step === "upload" && (
        <UploadStep
          uploadMode={uploadMode}
          setUploadMode={setUploadMode}
          pasteText={pasteText}
          setPasteText={setPasteText}
          loading={loading}
          onFile={(f) => void handleFile(f)}
          onResolvePaste={() => void resolveCollection(pasteText)}
        />
      )}

      {step === "review" && summary && (
        <ReviewStep
          summary={summary}
          collectionValue={collectionValue}
          format={format}
          setFormat={setFormat}
          colors={colors}
          setColors={setColors}
          strategy={strategy}
          setStrategy={setStrategy}
          powerLevel={powerLevel}
          setPowerLevel={setPowerLevel}
          budgetMax={budgetMax}
          setBudgetMax={setBudgetMax}
          avoidList={avoidList}
          setAvoidList={setAvoidList}
          houseRules={houseRules}
          setHouseRules={setHouseRules}
          politicsFriendly={politicsFriendly}
          setPoliticsFriendly={setPoliticsFriendly}
          loading={loading}
          onBuildStream={() => void buildDeckStream()}
          onBuild={() => void buildDeck()}
          onBuildThree={() => void buildThreeDecks()}
          onChangeCollection={() => setStep("upload")}
        />
      )}

      {step === "deck" && activeResult && (
        <div className="fade-in-up space-y-6">
          {deckTabs.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {deckTabs.map((tab, i) => (
                <button
                  key={tab.label}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    i === activeTab
                      ? "bg-amber-600 text-stone-950"
                      : "bg-stone-800 text-stone-400"
                  }`}
                >
                  {tab.label}
                  {!tab.result.validation.valid && " ⚠"}
                </button>
              ))}
            </div>
          )}

          {!activeResult.validation.valid && (
            <div className="relative overflow-hidden rounded-2xl border border-red-500/50 bg-gradient-to-br from-red-950/70 to-stone-950/70 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-bold text-red-50">
                    {activeResult.validation.errors.length} issue
                    {activeResult.validation.errors.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-sm text-red-200/80">
                    The AI can fix these automatically.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void refineDeck()}
                  className="rounded-xl bg-red-600 px-6 py-3 font-bold text-white disabled:opacity-50"
                >
                  {loading ? "Fixing…" : "Fix errors with AI"}
                </button>
              </div>
              <details className="mt-4 text-xs text-red-200/70">
                <summary className="cursor-pointer">See issues</summary>
                <ul className="mt-2 list-disc pl-4">
                  {activeResult.validation.errors.map((e, i) => (
                    <li key={`${i}-${e}`}>{e}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {activeResult.deck.weaknesses?.some((w) => w.trim().length > 0) && (
            <div className="relative overflow-hidden rounded-2xl border border-rose-500/40 bg-gradient-to-br from-rose-950/50 to-stone-950/70 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-bold text-rose-50">
                    {activeResult.deck.weaknesses!.filter((w) => w.trim()).length}{" "}
                    weakness
                    {activeResult.deck.weaknesses!.filter((w) => w.trim()).length === 1
                      ? ""
                      : "es"}{" "}
                    to address
                  </p>
                  <p className="text-sm text-rose-200/80">
                    AI can swap in cards from your collection to shore up these
                    gaps while keeping the core plan.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void shoreUpDeck()}
                  className="rounded-xl bg-rose-600 px-6 py-3 font-bold text-white disabled:opacity-50"
                >
                  {loading ? "Adjusting…" : "Shore up weaknesses"}
                </button>
              </div>
              <details className="mt-4 text-xs text-rose-200/70">
                <summary className="cursor-pointer">See weaknesses</summary>
                <ul className="mt-2 list-disc pl-4">
                  {activeResult.deck.weaknesses!
                    .filter((w) => w.trim())
                    .map((w, i) => (
                      <li key={`${i}-${w}`}>{w}</li>
                    ))}
                </ul>
              </details>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={downloadDeck}
              className="rounded-xl bg-amber-950/40 px-5 py-2.5 text-sm font-semibold text-amber-200 ring-1 ring-amber-700/40"
            >
              Download decklist
            </button>
            <button
              type="button"
              onClick={() => {
                setDeckTabs([]);
                setStep("review");
              }}
              className="text-sm text-stone-400 hover:text-amber-300"
            >
              ↻ Brew another
            </button>
          </div>

          <DeckDisplay
            deck={activeResult.deck}
            enriched={activeResult.enriched}
            validation={activeResult.validation}
            targetPowerLevel={powerLevel}
            onSwapCard={(name, zone) => void swapCard(name, zone)}
            swappingCard={swappingCard}
            onQuantityChange={setCardQuantity}
            onRemoveCard={removeCard}
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
    </div>
  );
}

