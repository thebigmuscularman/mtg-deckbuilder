"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  comparePowerToTarget,
  suggestPowerLevelAdjustment,
} from "@/lib/deck-preferences";
import { POWER_LEVELS } from "@/lib/power-levels";
import { collectionEstimatedValue } from "@/lib/prices";
import {
  loadDeckHistory,
  pushDeckHistory,
  type SavedDeckEntry,
} from "@/lib/storage";
import type { BuiltDeck, ResolvedCollectionCard } from "@/lib/types";
import { estimateDeckPowerLevel } from "@/lib/deck-stats";
import { validateDeck } from "@/lib/deck-validation";
import { nameKey } from "@/lib/scryfall";
import { ReviewStep } from "./deck-builder/ReviewStep";
import { UploadStep } from "./deck-builder/UploadStep";
import { DeckStage } from "./deck-builder/DeckStage";
import {
  AppHeader,
  Footer,
  HistorySidebar,
  StepIndicator,
  StreamingStatus,
} from "./deck-builder/AppShell";
import { BUILD_VARIANTS, type DeckResult, type Step } from "./deck-builder/types";
import { brewPayload, useDeckPrefs } from "./deck-builder/use-deck-prefs";
import { useBrewApi } from "./deck-builder/use-brew-api";
import { useCollection } from "./deck-builder/use-collection";

type Zone = "mainboard" | "sideboard" | "commander";

export function DeckBuilderApp() {
  const prefs = useDeckPrefs();
  const collection = useCollection();
  const api = useBrewApi();

  const [step, setStep] = useState<Step>("upload");
  const [uploadMode, setUploadMode] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [deckTabs, setDeckTabs] = useState<
    Array<{ label: string; result: DeckResult }>
  >([]);
  const [activeTab, setActiveTab] = useState(0);
  const [deckHistory, setDeckHistory] = useState<SavedDeckEntry[]>(() =>
    loadDeckHistory(),
  );
  const [showHistory, setShowHistory] = useState(false);

  const activeResult = deckTabs[activeTab]?.result ?? null;

  useEffect(() => {
    if (!prefs.hydrated) return;
    /* eslint-disable react-hooks/set-state-in-effect -- restore initial step from localStorage */
    if (collection.restore()) setStep("review");
    setDeckHistory(loadDeckHistory());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [prefs.hydrated, collection]);

  const collectionValue = useMemo(
    () =>
      collectionEstimatedValue(
        collection.resolved.map((r) => ({
          card: r.card,
          quantity: r.entry.quantity,
        })),
      ),
    [collection.resolved],
  );

  const payload = useCallback(
    () => brewPayload(prefs, collection.resolved),
    [prefs, collection.resolved],
  );

  const applyDeckResult = useCallback(
    (label: string, result: DeckResult) => {
      setDeckTabs((prev) => {
        const next = [...prev, { label, result }];
        setActiveTab(next.length - 1);
        return next;
      });
      pushDeckHistory(result.deck);
      setDeckHistory(loadDeckHistory());
      setStep("deck");
    },
    [],
  );

  const updateActiveTab = useCallback(
    (result: DeckResult) => {
      setDeckTabs((tabs) =>
        tabs.map((t, i) => (i === activeTab ? { ...t, result } : t)),
      );
      pushDeckHistory(result.deck);
      setDeckHistory(loadDeckHistory());
    },
    [activeTab],
  );

  const handleFile = useCallback(
    async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/resolve-collection", {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Upload failed");
        collection.setFromResponse(data);
        setStep("review");
      } catch (e) {
        api.setError(e instanceof Error ? e.message : "Upload failed");
      }
    },
    [api, collection],
  );

  const resolveCollection = useCallback(
    async (text: string) => {
      const data = await api.call<{
        resolved: ResolvedCollectionCard[];
        summary: { totalEntries: number; unresolved: unknown[] };
        uniqueCount: number;
      }>("/api/resolve-collection", { text });
      if (data) {
        collection.setFromResponse(data);
        setStep("review");
      }
    },
    [api, collection],
  );

  const buildStream = useCallback(async () => {
    setDeckTabs([]);
    await api.stream("/api/build-deck-stream", payload(), (result) => {
      applyDeckResult(result.deck.archetype ?? "Deck", result);
    });
  }, [api, payload, applyDeckResult]);

  const build = useCallback(async () => {
    setDeckTabs([]);
    const result = await api.call<DeckResult>("/api/build-deck", payload());
    if (result) applyDeckResult(result.deck.archetype ?? "Deck", result);
  }, [api, payload, applyDeckResult]);

  const buildThree = useCallback(async () => {
    setDeckTabs([]);
    const results: Array<{ label: string; result: DeckResult }> = [];
    for (const variant of BUILD_VARIANTS) {
      const result = await api.call<DeckResult>("/api/build-deck", {
        ...payload(),
        strategy: [prefs.strategy, variant.hint].filter(Boolean).join(" — "),
      });
      if (!result) return;
      results.push({ label: variant.label, result });
    }
    setDeckTabs(results);
    setActiveTab(0);
    for (const r of results) pushDeckHistory(r.result.deck);
    setDeckHistory(loadDeckHistory());
    setStep("deck");
  }, [api, payload, prefs.strategy]);

  const refine = useCallback(async () => {
    if (!activeResult) return;
    const result = await api.call<DeckResult>("/api/refine-deck", {
      ...payload(),
      deck: activeResult.deck,
      errors: activeResult.validation.errors,
    });
    if (result) updateActiveTab(result);
  }, [api, payload, activeResult, updateActiveTab]);

  const shoreUp = useCallback(async () => {
    if (!activeResult) return;
    if (!activeResult.deck.weaknesses?.some((w) => w.trim())) return;
    const result = await api.call<DeckResult>("/api/shore-up-deck", {
      ...payload(),
      deck: activeResult.deck,
    });
    if (result) updateActiveTab(result);
  }, [api, payload, activeResult, updateActiveTab]);

  const swap = useCallback(
    async (cardName: string, zone: Zone) => {
      if (!activeResult) return;
      const result = await api.swap<DeckResult>(
        "/api/swap-card",
        {
          ...payload(),
          deck: activeResult.deck,
          cardName,
          zone,
        },
        cardName,
      );
      if (result) {
        setDeckTabs((tabs) =>
          tabs.map((t, i) => (i === activeTab ? { ...t, result } : t)),
        );
      }
    },
    [api, payload, activeResult, activeTab],
  );

  const playableResolved = useMemo(
    () =>
      collection.resolved.filter((r) => r.card) as ResolvedCollectionCard[],
    [collection.resolved],
  );

  const revalidate = useCallback(
    (deck: BuiltDeck): DeckResult => {
      const v = validateDeck(deck, playableResolved, {
        allowIllegal: prefs.allowIllegal,
      });
      return {
        deck,
        validation: { valid: v.valid, errors: v.errors, warnings: v.warnings },
        enriched: {
          mainboard: v.enrichedMainboard,
          sideboard: v.enrichedSideboard,
          commander: v.commanderCard,
        },
      };
    },
    [playableResolved, prefs.allowIllegal],
  );

  const patchActiveDeck = useCallback(
    (mutate: (deck: BuiltDeck) => BuiltDeck) => {
      setDeckTabs((tabs) =>
        tabs.map((t, i) =>
          i === activeTab ? { ...t, result: revalidate(mutate(t.result.deck)) } : t,
        ),
      );
    },
    [activeTab, revalidate],
  );

  const setCardQuantity = useCallback(
    (cardName: string, zone: Zone, quantity: number) => {
      const key = nameKey(cardName);
      patchActiveDeck((deck) => {
        if (zone === "commander") return deck;
        const list =
          zone === "mainboard" ? [...deck.mainboard] : [...deck.sideboard];
        const idx = list.findIndex((l) => nameKey(l.name) === key);
        if (idx < 0) return deck;
        if (quantity <= 0) list.splice(idx, 1);
        else list[idx] = { ...list[idx], quantity };
        return zone === "mainboard"
          ? { ...deck, mainboard: list }
          : { ...deck, sideboard: list };
      });
    },
    [patchActiveDeck],
  );

  const removeCard = useCallback(
    (cardName: string, zone: Zone) => {
      const key = nameKey(cardName);
      patchActiveDeck((deck) => {
        if (zone === "commander") {
          return { ...deck, commander: null, commanderReason: undefined };
        }
        const list = zone === "mainboard" ? deck.mainboard : deck.sideboard;
        const filtered = list.filter((l) => nameKey(l.name) !== key);
        return zone === "mainboard"
          ? { ...deck, mainboard: filtered }
          : { ...deck, sideboard: filtered };
      });
    },
    [patchActiveDeck],
  );

  const rebuildForPower = useCallback(async () => {
    if (!activeResult) return;
    const est = estimateDeckPowerLevel(
      activeResult.deck,
      activeResult.enriched.mainboard,
      activeResult.enriched.commander,
    );
    const comparison = comparePowerToTarget(
      est.score,
      est.label,
      prefs.powerLevel,
    );
    const next = suggestPowerLevelAdjustment(comparison.status, prefs.powerLevel);
    if (!next) return;
    prefs.setPowerLevel(next);
    await api.stream(
      "/api/build-deck-stream",
      {
        ...payload(),
        powerLevel: next,
        strategy:
          prefs.strategy.trim() ||
          `Rebuild this deck to better match ${POWER_LEVELS[next].label} power (${comparison.status === "high" ? "tone down" : "more punch"}).`,
      },
      (result) => applyDeckResult("Power-adjusted", result),
    );
  }, [api, payload, prefs, activeResult, applyDeckResult]);

  const openHistoryEntry = useCallback(
    (entry: SavedDeckEntry) => {
      setDeckTabs([
        {
          label: entry.label,
          result: {
            deck: entry.deck,
            enriched: {
              mainboard: entry.deck.mainboard.map((l) => ({ ...l, card: null })),
              sideboard: entry.deck.sideboard.map((l) => ({ ...l, card: null })),
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
    },
    [],
  );

  if (!prefs.hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-amber-400/80">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <AppHeader
        theme={prefs.theme}
        onToggleTheme={() =>
          prefs.setTheme((t) => (t === "dark" ? "light" : "dark"))
        }
        onToggleHistory={() => setShowHistory((s) => !s)}
        historyCount={deckHistory.length}
      />

      {showHistory && (
        <HistorySidebar history={deckHistory} onOpen={openHistoryEntry} />
      )}

      <StepIndicator step={step} />

      {api.error && (
        <div className="fade-in-up mb-6 rounded-xl border border-red-700/40 bg-red-950/50 px-4 py-3 text-sm text-red-200 backdrop-blur">
          {api.error}
        </div>
      )}

      {api.loading && (
        <StreamingStatus status={api.streamStatus} preview={api.streamPreview} />
      )}

      {step === "upload" && (
        <UploadStep
          uploadMode={uploadMode}
          setUploadMode={setUploadMode}
          pasteText={pasteText}
          setPasteText={setPasteText}
          loading={api.loading}
          onFile={(f) => void handleFile(f)}
          onResolvePaste={() => void resolveCollection(pasteText)}
        />
      )}

      {step === "review" && collection.summary && (
        <ReviewStep
          summary={collection.summary}
          collectionValue={collectionValue}
          resolved={collection.resolved}
          prefs={prefs}
          loading={api.loading}
          onBuildStream={() => void buildStream()}
          onBuild={() => void build()}
          onBuildThree={() => void buildThree()}
          onChangeCollection={() => setStep("upload")}
          onRemoveCollectionLine={collection.removeAt}
        />
      )}

      {step === "deck" && (
        <DeckStage
          tabs={deckTabs}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          loading={api.loading}
          swappingCard={api.swappingCard}
          targetPowerLevel={prefs.powerLevel}
          onRefine={() => void refine()}
          onShoreUp={() => void shoreUp()}
          onBrewAnother={() => {
            setDeckTabs([]);
            setStep("review");
          }}
          onSwap={(name, zone) => void swap(name, zone)}
          onQuantityChange={setCardQuantity}
          onRemoveCard={removeCard}
          onRebuildForPower={() => void rebuildForPower()}
        />
      )}

      <Footer />
    </div>
  );
}
