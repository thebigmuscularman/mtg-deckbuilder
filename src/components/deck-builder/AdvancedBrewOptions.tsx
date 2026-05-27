"use client";

import { useEffect, useState } from "react";
import type {
  GameLength,
  InteractionDensity,
} from "@/lib/deck-preferences";
import type { FormatId } from "@/lib/types";
import {
  loadPlaygroupPresets,
  savePlaygroupPresets,
  type UserPrefs,
} from "@/lib/storage";

export type AdvancedBrewOptionsProps = {
  format: FormatId;
  allowIllegal: boolean;
  setAllowIllegal: (v: boolean) => void;
  interactionDensity: InteractionDensity;
  setInteractionDensity: (v: InteractionDensity) => void;
  gameLength: GameLength;
  setGameLength: (v: GameLength) => void;
  landsTarget: number;
  setLandsTarget: (n: number) => void;
  onApplyPreset: (prefs: Partial<UserPrefs>) => void;
};

const DENSITY_LABELS: Record<InteractionDensity, string> = {
  light: "Light",
  balanced: "Balanced",
  heavy: "Heavy",
};

const LENGTH_LABELS: Record<GameLength, string> = {
  fast: "Fast",
  balanced: "Balanced",
  grindy: "Grindy",
};

export function AdvancedBrewOptions({
  format,
  allowIllegal,
  setAllowIllegal,
  interactionDensity,
  setInteractionDensity,
  gameLength,
  setGameLength,
  landsTarget,
  setLandsTarget,
  onApplyPreset,
}: AdvancedBrewOptionsProps) {
  const defaultLands = format === "commander" ? 37 : 24;
  // Start empty so server-rendered HTML matches the client's first render;
  // load saved presets in an effect after hydration.
  const [presets, setPresets] = useState<ReturnType<typeof loadPlaygroupPresets>>([]);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage */
    setPresets(loadPlaygroupPresets());
  }, []);

  const savePreset = () => {
    const name = window.prompt("Preset name (e.g. LGS Commander night)");
    if (!name?.trim()) return;
    const next = [
      {
        id: crypto.randomUUID(),
        name: name.trim(),
        prefs: {
          allowIllegal,
          interactionDensity,
          gameLength,
          landsTarget: landsTarget || undefined,
        },
      },
      ...presets,
    ];
    savePlaygroupPresets(next);
    setPresets(next);
  };

  return (
    <div className="mb-6 space-y-4 rounded-2xl border border-stone-800/80 bg-stone-950/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-500/80">
        Advanced brew options
      </p>

      <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-stone-900/40 px-4 py-2.5 ring-1 ring-stone-800/80">
        <input
          type="checkbox"
          checked={allowIllegal}
          onChange={(e) => setAllowIllegal(e.target.checked)}
          className="h-4 w-4 rounded border-stone-600 bg-stone-950 text-amber-500"
        />
        <span className="text-sm text-stone-200">
          Allow format-illegal cards from my collection
        </span>
      </label>

      <ChipGroup
        label="Interaction density"
        options={DENSITY_LABELS}
        value={interactionDensity}
        onChange={setInteractionDensity}
      />

      <ChipGroup
        label="Game length"
        options={LENGTH_LABELS}
        value={gameLength}
        onChange={setGameLength}
      />

      <div>
        <label className="mb-2 block text-xs text-stone-500">
          Lands target (optional, mainboard)
        </label>
        <input
          type="range"
          min={format === "commander" ? 30 : 20}
          max={format === "commander" ? 42 : 28}
          value={landsTarget > 0 ? landsTarget : defaultLands}
          onChange={(e) => setLandsTarget(parseInt(e.target.value, 10))}
          onMouseUp={() => {
            if (landsTarget <= 0) setLandsTarget(defaultLands);
          }}
          className="w-full"
        />
        <div className="mt-1 flex items-center justify-center gap-3">
          <p className="text-sm tabular-nums text-amber-200">
            {landsTarget > 0 ? `${landsTarget} lands` : "AI picks land count"}
          </p>
          {landsTarget > 0 && (
            <button
              type="button"
              onClick={() => setLandsTarget(0)}
              className="text-xs text-stone-500 underline"
            >
              Reset to auto
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone-800/80 pt-3">
        <button
          type="button"
          onClick={savePreset}
          className="rounded-lg bg-stone-800 px-3 py-1.5 text-xs font-semibold text-stone-300"
        >
          Save playgroup preset
        </button>
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onApplyPreset(p.prefs)}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs text-amber-200/90 ring-1 ring-stone-700"
          >
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Record<T, string>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-stone-500">{label}</p>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              value === id
                ? "bg-amber-600 text-stone-950"
                : "bg-stone-800 text-stone-400"
            }`}
          >
            {options[id]}
          </button>
        ))}
      </div>
    </div>
  );
}
