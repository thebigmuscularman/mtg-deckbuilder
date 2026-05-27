import type { CollectionEntry, ScryfallCard } from "./types";

const SCRYFALL_BASE = "https://api.scryfall.com";
const BATCH_SIZE = 75;
const RATE_LIMIT_MS = 100;

/**
 * Canonical map key for matching card names across the codebase.
 * Trims AND lowercases so trailing whitespace (e.g. from paste lists)
 * does not silently miss in lookups.
 */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scryfallFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${SCRYFALL_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "mtg-deckbuilder/1.0",
      ...init?.headers,
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Scryfall ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

type CollectionResponse = {
  data: ScryfallCard[];
  not_found: Array<{ name?: string; set?: string; collector_number?: string }>;
};

function entryToIdentifier(entry: CollectionEntry) {
  if (entry.set && entry.collectorNumber) {
    return {
      set: entry.set,
      collector_number: entry.collectorNumber,
    };
  }
  return { name: entry.name };
}

export async function resolveCollection(
  entries: CollectionEntry[],
): Promise<Map<string, ScryfallCard | null>> {
  const results = new Map<string, ScryfallCard | null>();
  const uniqueKeys = new Map<string, CollectionEntry>();

  for (const entry of entries) {
    const key = cardKey(entry);
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, entry);
    }
  }

  const toResolve = [...uniqueKeys.values()];

  for (let i = 0; i < toResolve.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(RATE_LIMIT_MS);

    const batch = toResolve.slice(i, i + BATCH_SIZE);
    const body = {
      identifiers: batch.map(entryToIdentifier),
    };

    const response = await scryfallFetch<CollectionResponse>(
      "/cards/collection",
      {
        method: "POST",
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );

    const notFoundSet = new Set(
      (response.not_found ?? []).map((nf) =>
        nf.name
          ? nameKey(nf.name)
          : nameKey(`${nf.set}:${nf.collector_number}`),
      ),
    );

    for (const card of response.data ?? []) {
      results.set(nameKey(card.name), card);
      if (card.card_faces?.[0]?.name) {
        results.set(nameKey(card.card_faces[0].name), card);
      }
    }

    for (const entry of batch) {
      const key = cardKey(entry);
      if (results.has(nameKey(entry.name))) continue;

      const idKey = entry.set && entry.collectorNumber
        ? nameKey(`${entry.set}:${entry.collectorNumber}`)
        : nameKey(entry.name);

      if (notFoundSet.has(idKey) || notFoundSet.has(nameKey(entry.name))) {
        results.set(key, null);
      }
    }
  }

  for (const entry of entries) {
    const key = cardKey(entry);
    if (!results.has(key)) {
      const byName = results.get(nameKey(entry.name));
      results.set(key, byName ?? null);
    }
  }

  return results;
}

export function cardKey(entry: CollectionEntry): string {
  if (entry.set && entry.collectorNumber) {
    return nameKey(`${entry.set}:${entry.collectorNumber}:${entry.name}`);
  }
  return nameKey(entry.name);
}

export function getCardImage(card: ScryfallCard): string | undefined {
  if (card.image_uris?.normal) return card.image_uris.normal;
  return card.card_faces?.[0]?.image_uris?.normal;
}

export function getDisplayName(card: ScryfallCard): string {
  return card.card_faces?.[0]?.name ?? card.name;
}
