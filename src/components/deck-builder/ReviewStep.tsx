"use client";

import { FORMATS } from "@/lib/formats";
import { POWER_LEVELS, type PowerLevelId } from "@/lib/power-levels";
import { formatUsd } from "@/lib/prices";
import type { FormatId, ResolvedCollectionCard } from "@/lib/types";
import { AdvancedBrewOptions } from "./AdvancedBrewOptions";
import { CollectionManager } from "./CollectionManager";
import { Stat } from "./Stat";
import { COLOR_META, type Color } from "./types";
import type { DeckPrefsApi } from "./use-deck-prefs";

export type ReviewStepProps = {
  summary: { total: number; unique: number; unresolved: number };
  collectionValue: number;
  resolved: ResolvedCollectionCard[];
  prefs: DeckPrefsApi;
  loading: boolean;
  onBuildStream: () => void;
  onBuild: () => void;
  onBuildThree: () => void;
  onChangeCollection: () => void;
  onRemoveCollectionLine: (index: number) => void;
};

const HOUSE_RULE_LABELS = [
  ["noMassLandDestruction", "No mass land destruction"],
  ["noInfiniteCombos", "No infinite / game-winning combos"],
  ["noExtraTurns", "No extra-turn engines"],
] as const;

export function ReviewStep({
  summary,
  collectionValue,
  resolved,
  prefs,
  loading,
  onBuildStream,
  onBuild,
  onBuildThree,
  onChangeCollection,
  onRemoveCollectionLine,
}: ReviewStepProps) {
  const { format, colors, powerLevel } = prefs;
  const disabled = loading || summary.unique < 10;

  return (
    <div className="fade-in-up space-y-6">
      <CollectionManager resolved={resolved} onRemove={onRemoveCollectionLine} />

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
        <SectionLabel>Format</SectionLabel>
        <div className="mb-2 flex flex-wrap gap-2">
          {(Object.keys(FORMATS) as FormatId[]).map((id) => (
            <Pill
              key={id}
              active={format === id}
              onClick={() => prefs.setFormat(id)}
            >
              {FORMATS[id].label}
            </Pill>
          ))}
        </div>
        <Hint>{FORMATS[format].description}</Hint>

        <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
          <span>
            Color combo <span className="text-stone-600">(optional)</span>
          </span>
          {colors.length > 0 && (
            <button
              type="button"
              onClick={() => prefs.setColors([])}
              className="text-[0.65rem] font-normal normal-case tracking-normal text-stone-500 hover:text-amber-300"
            >
              Clear
            </button>
          )}
        </div>
        <fieldset className="mb-2">
          <legend className="sr-only">Pick deck colors</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(Object.keys(COLOR_META) as Color[]).map((c) => (
              <ColorChip
                key={c}
                color={c}
                active={colors.includes(c)}
                onToggle={() =>
                  prefs.setColors((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                  )
                }
              />
            ))}
          </div>
        </fieldset>
        <Hint>
          {colors.length === 0
            ? "Tick none to let the AI choose colors."
            : format === "commander"
              ? `Commander identity must be exactly ${colors.join("")}.`
              : `Deck limited to ${colors.join("")}.`}
        </Hint>

        <SectionLabel>
          Strategy <span className="text-stone-600">(optional)</span>
        </SectionLabel>
        <textarea
          value={prefs.strategy}
          onChange={(e) => prefs.setStrategy(e.target.value)}
          placeholder="Describe the deck in your own words — what should it do, who's it for, any pet themes or flavor goals. e.g. 'I want a Yuriko ninja deck that ramps into big top-of-library cheats, focused on the LGS Tuesday tables — not too oppressive'."
          rows={4}
          className="mb-4 w-full resize-y rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />

        <PowerLevelSection
          powerLevel={powerLevel}
          setPowerLevel={prefs.setPowerLevel}
        />

        <SectionLabel>
          Budget cap <span className="text-stone-600">(optional, $ per card)</span>
        </SectionLabel>
        <input
          type="number"
          min={0}
          step={0.5}
          value={prefs.budgetMax || ""}
          onChange={(e) => prefs.setBudgetMax(parseFloat(e.target.value) || 0)}
          placeholder="e.g. 5 — no card over $5"
          className="mb-2 w-full rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />
        <p className="mb-7 text-xs text-stone-500">
          Caps the price of any single card in USD. For card power, use the power
          level above.
        </p>

        <SectionLabel>
          Must include <span className="text-stone-600">(optional)</span>
        </SectionLabel>
        <textarea
          value={prefs.mustIncludeList}
          onChange={(e) => prefs.setMustIncludeList(e.target.value)}
          placeholder="Cards the AI must put in (one per line or comma-separated)"
          rows={3}
          className="mb-4 w-full resize-y rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />

        <SectionLabel>
          Ban list <span className="text-stone-600">(optional)</span>
        </SectionLabel>
        <textarea
          value={prefs.avoidList}
          onChange={(e) => prefs.setAvoidList(e.target.value)}
          placeholder="One card per line or comma-separated"
          rows={3}
          className="mb-4 w-full resize-y rounded-xl border border-stone-700/60 bg-stone-950/60 px-4 py-3 text-sm text-stone-100 placeholder:text-stone-600 focus:border-amber-500 focus:outline-none"
        />

        <AdvancedBrewOptions
          format={format}
          allowIllegal={prefs.allowIllegal}
          setAllowIllegal={prefs.setAllowIllegal}
          interactionDensity={prefs.interactionDensity}
          setInteractionDensity={prefs.setInteractionDensity}
          gameLength={prefs.gameLength}
          setGameLength={prefs.setGameLength}
          landsTarget={prefs.landsTarget}
          setLandsTarget={prefs.setLandsTarget}
          onApplyPreset={prefs.applyPreset}
        />

        <SectionLabel>House rules</SectionLabel>
        <div className="mb-4 space-y-2">
          {HOUSE_RULE_LABELS.map(([key, label]) => (
            <Toggle
              key={key}
              label={label}
              checked={prefs.houseRules[key]}
              onChange={(checked) =>
                prefs.setHouseRules((prev) => ({ ...prev, [key]: checked }))
              }
            />
          ))}
        </div>

        {format === "commander" && (
          <label className="mb-7 flex cursor-pointer items-center gap-3 rounded-xl bg-stone-900/40 px-4 py-3 ring-1 ring-stone-800/80">
            <input
              type="checkbox"
              checked={prefs.politicsFriendly}
              onChange={(e) => prefs.setPoliticsFriendly(e.target.checked)}
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
            disabled={disabled}
            onClick={onBuildStream}
            className="glow-button rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 px-6 py-3 font-bold text-stone-950 disabled:opacity-50"
          >
            {loading ? "Brewing…" : "Build deck (live)"}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onBuild}
            className="rounded-xl bg-stone-800 px-5 py-3 text-sm font-semibold text-amber-200 ring-1 ring-stone-700 disabled:opacity-50"
          >
            Quick build
          </button>
          <button
            type="button"
            disabled={disabled}
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
      {children}
    </label>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="mb-6 text-xs italic text-stone-500">{children}</p>;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card-hover rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-gradient-to-br from-amber-400 to-amber-600 text-stone-950 shadow-lg"
          : "bg-stone-800/80 text-stone-300 ring-1 ring-stone-700/60"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-stone-900/40 px-4 py-2.5 ring-1 ring-stone-800/80">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-amber-500 focus:ring-amber-500"
      />
      <span className="text-sm text-stone-200">{label}</span>
    </label>
  );
}

function ColorChip({
  color,
  active,
  onToggle,
}: {
  color: Color;
  active: boolean;
  onToggle: () => void;
}) {
  const meta = COLOR_META[color];
  const id = `color-${color}`;
  return (
    <label
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
        onChange={onToggle}
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
}

function PowerLevelSection({
  powerLevel,
  setPowerLevel,
}: {
  powerLevel: PowerLevelId;
  setPowerLevel: (p: PowerLevelId) => void;
}) {
  const ids = Object.keys(POWER_LEVELS) as PowerLevelId[];
  return (
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
        {ids.map((id) => (
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
        {ids.map((id) => {
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
  );
}
