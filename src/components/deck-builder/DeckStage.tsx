"use client";

import { exportDeck } from "@/lib/export-formats";
import type { BuiltDeck } from "@/lib/types";
import type { PowerLevelId } from "@/lib/power-levels";
import { DeckDisplay } from "../DeckDisplay";
import type { DeckResult } from "./types";

type Tab = { label: string; result: DeckResult };

export type DeckStageProps = {
  tabs: Tab[];
  activeTab: number;
  setActiveTab: (i: number) => void;
  loading: boolean;
  swappingCard: string | null;
  targetPowerLevel: PowerLevelId;
  onRefine: () => void;
  onShoreUp: () => void;
  onBrewAnother: () => void;
  onSwap: (name: string, zone: "mainboard" | "sideboard" | "commander") => void;
  onQuantityChange: (
    name: string,
    zone: "mainboard" | "sideboard" | "commander",
    quantity: number,
  ) => void;
  onRemoveCard: (
    name: string,
    zone: "mainboard" | "sideboard" | "commander",
  ) => void;
  onRebuildForPower: () => void;
};

function downloadDeck(deck: BuiltDeck) {
  const text = exportDeck(deck, "plain");
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${deck.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export function DeckStage(props: DeckStageProps) {
  const {
    tabs,
    activeTab,
    setActiveTab,
    loading,
    swappingCard,
    targetPowerLevel,
    onRefine,
    onShoreUp,
    onBrewAnother,
    onSwap,
    onQuantityChange,
    onRemoveCard,
    onRebuildForPower,
  } = props;
  const activeResult = tabs[activeTab]?.result;
  if (!activeResult) return null;

  const { deck, validation, enriched } = activeResult;
  const weaknesses = deck.weaknesses?.filter((w) => w.trim().length > 0) ?? [];

  return (
    <div className="fade-in-up space-y-6">
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab, i) => (
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

      {!validation.valid && (
        <Banner
          tone="red"
          title={`${validation.errors.length} issue${validation.errors.length === 1 ? "" : "s"}`}
          subtitle="The AI can fix these automatically."
          buttonLabel={loading ? "Fixing…" : "Fix errors with AI"}
          onClick={onRefine}
          disabled={loading}
          details={validation.errors}
          detailsLabel="See issues"
        />
      )}

      {weaknesses.length > 0 && (
        <Banner
          tone="rose"
          title={`${weaknesses.length} weakness${weaknesses.length === 1 ? "" : "es"} to address`}
          subtitle="AI can swap in cards from your collection to shore up these gaps while keeping the core plan."
          buttonLabel={loading ? "Adjusting…" : "Shore up weaknesses"}
          onClick={onShoreUp}
          disabled={loading}
          details={weaknesses}
          detailsLabel="See weaknesses"
        />
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => downloadDeck(deck)}
          className="rounded-xl bg-amber-950/40 px-5 py-2.5 text-sm font-semibold text-amber-200 ring-1 ring-amber-700/40"
        >
          Download decklist
        </button>
        <button
          type="button"
          onClick={onBrewAnother}
          className="text-sm text-stone-400 hover:text-amber-300"
        >
          ↻ Brew another
        </button>
      </div>

      <DeckDisplay
        deck={deck}
        enriched={enriched}
        validation={validation}
        targetPowerLevel={targetPowerLevel}
        onSwapCard={onSwap}
        swappingCard={swappingCard}
        onQuantityChange={onQuantityChange}
        onRemoveCard={onRemoveCard}
        onRebuildForPower={onRebuildForPower}
        rebuilding={loading}
      />
    </div>
  );
}

function Banner({
  tone,
  title,
  subtitle,
  buttonLabel,
  onClick,
  disabled,
  details,
  detailsLabel,
}: {
  tone: "red" | "rose";
  title: string;
  subtitle: string;
  buttonLabel: string;
  onClick: () => void;
  disabled?: boolean;
  details: string[];
  detailsLabel: string;
}) {
  const palette =
    tone === "red"
      ? {
          ring: "border-red-500/50",
          bg: "from-red-950/70 to-stone-950/70",
          title: "text-red-50",
          sub: "text-red-200/80",
          btn: "bg-red-600",
          details: "text-red-200/70",
        }
      : {
          ring: "border-rose-500/40",
          bg: "from-rose-950/50 to-stone-950/70",
          title: "text-rose-50",
          sub: "text-rose-200/80",
          btn: "bg-rose-600",
          details: "text-rose-200/70",
        };
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${palette.ring} bg-gradient-to-br ${palette.bg} p-6`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={`text-lg font-bold ${palette.title}`}>{title}</p>
          <p className={`text-sm ${palette.sub}`}>{subtitle}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          className={`rounded-xl ${palette.btn} px-6 py-3 font-bold text-white disabled:opacity-50`}
        >
          {buttonLabel}
        </button>
      </div>
      <details className={`mt-4 text-xs ${palette.details}`}>
        <summary className="cursor-pointer">{detailsLabel}</summary>
        <ul className="mt-2 list-disc pl-4">
          {details.map((e, i) => (
            <li key={`${i}-${e}`}>{e}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
