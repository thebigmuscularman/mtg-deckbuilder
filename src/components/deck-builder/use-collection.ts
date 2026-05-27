"use client";

import { useCallback, useState } from "react";
import { loadCollection, saveCollection } from "@/lib/storage";
import type { ResolvedCollectionCard } from "@/lib/types";

export type CollectionSummary = {
  total: number;
  unique: number;
  unresolved: number;
};

function summarize(resolved: ResolvedCollectionCard[]): CollectionSummary {
  const playable = resolved.filter((r) => r.card);
  return {
    total: resolved.reduce((s, r) => s + r.entry.quantity, 0),
    unique: new Set(playable.map((r) => r.card!.id)).size,
    unresolved: resolved.filter((r) => !r.card).length,
  };
}

export function useCollection() {
  const [resolved, setResolved] = useState<ResolvedCollectionCard[]>([]);
  const [summary, setSummary] = useState<CollectionSummary | null>(null);

  const persist = useCallback((next: ResolvedCollectionCard[]) => {
    const sum = summarize(next);
    setSummary(sum);
    saveCollection({
      resolved: next,
      summary: sum,
      savedAt: new Date().toISOString(),
    });
  }, []);

  const restore = useCallback(() => {
    const saved = loadCollection();
    if (!saved) return false;
    setResolved(saved.resolved);
    setSummary(saved.summary);
    return true;
  }, []);

  const setFromResponse = useCallback(
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
    },
    [],
  );

  const removeAt = useCallback(
    (index: number) => {
      setResolved((prev) => {
        const next = prev.filter((_, i) => i !== index);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { resolved, summary, restore, setFromResponse, removeAt };
}
