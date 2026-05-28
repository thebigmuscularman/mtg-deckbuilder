"use client";

import type { PowerTargetComparison } from "@/lib/deck-preferences";
import type { DeckStats, PowerLevelResult } from "@/lib/deck-stats";
import { formatUsd } from "@/lib/prices";
import { ManaIdentityBadge } from "./ManaIdentityBadge";

const PIP_MS: Record<string, string> = {
  W: "ms-w",
  U: "ms-u",
  B: "ms-b",
  R: "ms-r",
  G: "ms-g",
};

export function DeckStatsPanel({
  stats,
  landWarnings,
  powerLevel,
  powerComparison,
  onRebuildForPower,
  rebuilding,
  deckValueUsd,
  colorIdentity,
}: {
  stats: DeckStats;
  landWarnings: string[];
  powerLevel: PowerLevelResult | null;
  powerComparison?: PowerTargetComparison | null;
  onRebuildForPower?: () => void;
  rebuilding?: boolean;
  deckValueUsd: number;
  colorIdentity?: string[];
}) {
  const maxCurve = Math.max(1, ...stats.curve.map((b) => b.count));

  return (
    <div className="glass-panel space-y-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
          Deck stats
        </h3>
        {colorIdentity && (
          <ManaIdentityBadge colors={colorIdentity} label="Identity" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="Main deck" value={String(stats.mainCount)} />
        <StatBox label="Lands" value={String(stats.landCount)} />
        <StatBox
          label="Avg CMC"
          value={stats.avgCmc > 0 ? stats.avgCmc.toFixed(2) : "—"}
        />
        <StatBox
          label="Est. value"
          value={deckValueUsd > 0 ? formatUsd(deckValueUsd) : "—"}
        />
      </div>

      <div>
        <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-stone-500">
          Mana curve (nonlands)
        </p>
        <div className="flex items-end gap-1.5 h-24">
          {stats.curve.map((bucket) => (
            <div
              key={bucket.label}
              className="flex flex-1 flex-col items-center gap-1"
            >
              <span className="text-[0.65rem] tabular-nums text-stone-400">
                {bucket.count || ""}
              </span>
              <div
                className="w-full rounded-t bg-gradient-to-t from-amber-700 to-amber-400 transition-all"
                style={{
                  height: `${Math.max(4, (bucket.count / maxCurve) * 72)}px`,
                }}
                title={`${bucket.count} at CMC ${bucket.label}`}
              />
              <span className="text-[0.65rem] font-medium text-stone-500">
                {bucket.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {Object.keys(stats.colorPips).length > 0 && (
        <div>
          <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-stone-500">
            Colored mana symbols in costs
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.colorPips)
              .sort(([a], [b]) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b))
              .map(([c, n]) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-lg bg-stone-900/60 px-2 py-1 text-xs text-stone-300 ring-1 ring-stone-800"
                >
                  <i className={`ms ${PIP_MS[c] ?? "ms-c"} ms-cost text-sm`} />
                  <span className="tabular-nums">{n}</span>
                </span>
              ))}
          </div>
        </div>
      )}

      {powerLevel && (
        <div className="rounded-xl border border-purple-800/40 bg-purple-950/30 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-purple-300">
            Power estimate
          </p>
          <p className="mt-1 text-lg font-black text-purple-100">
            {powerLevel.score}/10 — {powerLevel.label}
          </p>
          {powerLevel.factors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-xs text-purple-200/80">
              {powerLevel.factors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {powerComparison && (
        <div
          className={`rounded-xl border p-3 ${
            powerComparison.status === "match"
              ? "border-emerald-800/40 bg-emerald-950/30"
              : powerComparison.status === "high"
                ? "border-amber-800/40 bg-amber-950/30"
                : "border-sky-800/40 bg-sky-950/30"
          }`}
        >
          <p
            className={`text-xs font-bold uppercase tracking-wider ${
              powerComparison.status === "match"
                ? "text-emerald-300"
                : powerComparison.status === "high"
                  ? "text-amber-300"
                  : "text-sky-300"
            }`}
          >
            Target: {powerComparison.targetLabel} ({powerComparison.targetBracket})
          </p>
          <p className="mt-1 text-sm leading-relaxed text-stone-200/95">
            {powerComparison.message}
          </p>
          {powerComparison.status !== "match" && onRebuildForPower && (
            <button
              type="button"
              disabled={rebuilding}
              onClick={onRebuildForPower}
              className="mt-3 w-full rounded-lg bg-amber-600 px-3 py-2 text-sm font-bold text-stone-950 disabled:opacity-50"
            >
              {rebuilding ? "Rebuilding…" : "Rebuild toward target power"}
            </button>
          )}
        </div>
      )}

      {landWarnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-200/90">
          {landWarnings.map((w) => (
            <li key={w} className="flex gap-2">
              <span>⚠</span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-stone-950/50 px-3 py-2 ring-1 ring-stone-800/80">
      <p className="text-[0.65rem] uppercase tracking-wider text-stone-500">
        {label}
      </p>
      <p className="text-lg font-bold tabular-nums text-amber-100">{value}</p>
    </div>
  );
}
