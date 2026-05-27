"use client";

import { FORMATS } from "@/lib/formats";
import type { HouseRules } from "@/lib/deck-preferences";
import { POWER_LEVELS, type PowerLevelId } from "@/lib/power-levels";
import { formatUsd } from "@/lib/prices";
import type { FormatId } from "@/lib/types";
import { Stat } from "./Stat";
import { COLOR_META, type Color } from "./types";

export type ReviewStepProps = {
  summary: { total: number; unique: number; unresolved: number };
  collectionValue: number;
  format: FormatId;
  setFormat: (f: FormatId) => void;
  colors: Color[];
  setColors: React.Dispatch<React.SetStateAction<Color[]>>;
  strategy: string;
  setStrategy: (s: string) => void;
  powerLevel: PowerLevelId;
  setPowerLevel: (p: PowerLevelId) => void;
  budgetMax: number;
  setBudgetMax: (n: number) => void;
  avoidList: string;
  setAvoidList: (s: string) => void;
  houseRules: HouseRules;
  setHouseRules: React.Dispatch<React.SetStateAction<HouseRules>>;
  politicsFriendly: boolean;
  setPoliticsFriendly: (v: boolean) => void;
  loading: boolean;
  onBuildStream: () => void;
  onBuild: () => void;
  onBuildThree: () => void;
  onChangeCollection: () => void;
};

export function ReviewStep({
  summary,
  collectionValue,
  format,
  setFormat,
  colors,
  setColors,
  strategy,
  setStrategy,
  powerLevel,
  setPowerLevel,
  budgetMax,
  setBudgetMax,
  avoidList,
  setAvoidList,
  houseRules,
  setHouseRules,
  politicsFriendly,
  setPoliticsFriendly,
  loading,
  onBuildStream,
  onBuild,
  onBuildThree,
  onChangeCollection,
}: ReviewStepProps) {
  return (
    <div className="fade-in-up space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Lines" value={summary.total} />
        <Stat label="Unique cards" value={summary.unique} />
        <Stat
          label="Unresolved"
          value={summary.unresolved}
          warn={summary.unresolved > 0}
        />
        <Stat
          label="Collection value"
          value={collectionValue > 0 ? formatUsd(collectionValue) : "—"}
        />
      </div>

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
                  ? "bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-lg"
                  : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60"
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
          <legend className="sr-only">Pick deck colors</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(COLOR_META) as Color[]).map((c) => {
              const meta = COLOR_META[c];
              const active = colors.includes(c);
              const id = `color-${c}`;
              return (
                <label
                  key={c}
                  htmlFor={id}
                  className={`card-hover flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                    active
                      ? `${meta.bg} ${meta.text} shadow-lg ring-2 ${meta.ring}`
                      : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60"
                  }`}
                >
                  <input
                    id={id}
                    type="checkbox"
                    checked={active}
                    onChange={() =>
                      setColors((prev) =>
                        prev.includes(c)
                          ? prev.filter((x) => x !== c)
                          : [...prev, c],
                      )
                    }
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold ${
                      active
                        ? "border-black/40 bg-black/20 text-current"
                        : "border-stone-500 bg-stone-900/60 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-base shadow-inner ${meta.pip}`}
                  >
                    <i className={`ms ${meta.ms}`} />
                  </span>
                  <span className="flex-1">{meta.name}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <p className="mb-6 text-xs italic text-stone-500">
          {colors.length === 0
            ? "Tick none to let the AI choose colors."
            : format === "commander"
              ? `Commander identity must be exactly ${colors.join("")}.`
              : `Deck limited to ${colors.join("")}.`}
        </p>

        <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          Strategy <span className="text-stone-600">(optional)</span>
        </label>
        <input
          type="text"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          placeholder="e.g. tokens, reanimator, burn…"
          className="mb-4 w-full rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />

        <div className="mb-7 rounded-2xl border border-amber-700/30 bg-amber-950/10 p-5">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-amber-500/80">
              Power level
            </p>
            <p className="text-[0.65rem] uppercase tracking-wider text-stone-500">
              Card power · not price
            </p>
          </div>
          <h3 className="mb-2 text-lg font-bold text-amber-100">
            How powerful should the deck be?
          </h3>
          <p className="mb-4 text-xs text-stone-400">
            Picks the kind of cards the AI reaches for — staples, fast mana, tutors,
            combos. Use the budget cap below for a price ceiling.
          </p>
          <div
            role="group"
            aria-label="Power level"
            className="mb-3 flex h-2 w-full overflow-hidden rounded-full ring-1 ring-stone-800/80"
          >
            {(Object.keys(POWER_LEVELS) as PowerLevelId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setPowerLevel(id)}
                aria-label={POWER_LEVELS[id].label}
                aria-pressed={powerLevel === id}
                className={`h-full flex-1 transition ${
                  powerLevel === id
                    ? "bg-gradient-to-r from-amber-400 to-amber-600"
                    : "bg-stone-800/70 hover:bg-stone-700/70"
                }`}
              />
            ))}
          </div>
          <div className="mb-4 flex justify-between text-[0.6rem] uppercase tracking-wider text-stone-500">
            <span>1 · Casual</span>
            <span>10 · cEDH</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(POWER_LEVELS) as PowerLevelId[]).map((id) => {
              const meta = POWER_LEVELS[id];
              const active = powerLevel === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPowerLevel(id)}
                  className={`card-hover rounded-xl px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? "bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-lg"
                      : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60"
                  }`}
                  aria-pressed={active}
                >
                  <span className="block font-bold">{meta.label}</span>
                  <span
                    className={`block text-[0.65rem] uppercase tracking-wider ${
                      active ? "text-stone-900/80" : "text-stone-500"
                    }`}
                  >
                    {meta.bracket}
                  </span>
                  <span
                    className={`mt-1 block text-[0.7rem] leading-snug ${
                      active ? "text-stone-900/90" : "text-stone-400"
                    }`}
                  >
                    {meta.short}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs italic text-stone-500">
            {POWER_LEVELS[powerLevel].hint}
          </p>
        </div>

        <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          Budget cap <span className="text-stone-600">(optional, $ per card)</span>
        </label>
        <input
          type="number"
          min={0}
          step={0.5}
          value={budgetMax || ""}
          onChange={(e) => setBudgetMax(parseFloat(e.target.value) || 0)}
          placeholder="e.g. 5 — no card over $5"
          className="mb-2 w-full rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />
        <p className="mb-7 text-xs text-stone-500">
          Caps the price of any single card in USD. For card power, use the power
          level above.
        </p>

        <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          Ban list <span className="text-stone-600">(optional)</span>
        </label>
        <textarea
          value={avoidList}
          onChange={(e) => setAvoidList(e.target.value)}
          placeholder="One card per line or comma-separated"
          rows={3}
          className="mb-4 w-full resize-y rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />

        <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          House rules
        </label>
        <div className="mb-4 space-y-2">
          {(
            [
              ["noMassLandDestruction", "No mass land destruction"],
              ["noInfiniteCombos", "No infinite / game-winning combos"],
              ["noExtraTurns", "No extra-turn engines"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex cursor-pointer items-center gap-3 rounded-xl bg-stone-900/40 px-4 py-2.5 ring-1 ring-stone-800/80"
            >
              <input
                type="checkbox"
                checked={houseRules[key]}
                onChange={(e) =>
                  setHouseRules((prev) => ({
                    ...prev,
                    [key]: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-amber-500 focus:ring-amber-500"
              />
              <span className="text-sm text-stone-200">{label}</span>
            </label>
          ))}
        </div>

        {format === "commander" && (
          <label className="mb-7 flex cursor-pointer items-center gap-3 rounded-xl bg-stone-900/40 px-4 py-3 ring-1 ring-stone-800/80">
            <input
              type="checkbox"
              checked={politicsFriendly}
              onChange={(e) => setPoliticsFriendly(e.target.checked)}
              className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-amber-500 focus:ring-amber-500"
            />
            <span className="text-sm text-stone-200">
              <span className="font-semibold text-amber-200/90">
                Politics-friendly Commander
              </span>
              <span className="mt-0.5 block text-xs text-stone-500">
                Group-hug / pillowfort — wins without making enemies
              </span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={loading || summary.unique < 10}
            onClick={onBuildStream}
            className="glow-button rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 px-6 py-3 font-bold text-stone-950 disabled:opacity-50"
          >
            {loading ? "Brewing…" : "Build deck (live)"}
          </button>
          <button
            type="button"
            disabled={loading || summary.unique < 10}
            onClick={onBuild}
            className="rounded-xl bg-stone-800 px-5 py-3 text-sm font-semibold text-amber-200 ring-1 ring-stone-700 disabled:opacity-50"
          >
            Quick build
          </button>
          <button
            type="button"
            disabled={loading || summary.unique < 10}
            onClick={onBuildThree}
            className="rounded-xl bg-purple-900/50 px-5 py-3 text-sm font-semibold text-purple-200 ring-1 ring-purple-700/50 disabled:opacity-50"
          >
            Build 3 archetypes
          </button>
          <button
            type="button"
            onClick={onChangeCollection}
            className="text-sm text-stone-400 hover:text-amber-300"
          >
            ← Change collection
          </button>
        </div>
      </div>
    </div>
  );
}
