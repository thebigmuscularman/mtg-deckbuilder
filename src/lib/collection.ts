import type { CollectionEntry } from "./types";
import { nameKey } from "./scryfall";

const QUANTITY_FIRST = /^(\d+)\s*[xX]?\s+(.+)$/;
const NAME_FIRST = /^(.+?)\s*[xX](\d+)$/;
const MOXFIELD_LINE =
  /^(\d+)\s+(.+?)\s+\(([A-Za-z0-9]{2,6})\)\s+(\S+?)(?:\s+\*F\*)?\s*$/;

function parseQuantity(value: string): number {
  const n = parseInt(value.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function cleanName(name: string): string {
  return name
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === "," || ch === "\t" || ch === ";") && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  result.push(current.trim());
  return result.filter(Boolean);
}

function parseLine(line: string): CollectionEntry | null {
  const trimmed = line.trim().replace(/\s+\*F\*\s*$/, "");
  if (!trimmed || trimmed.startsWith("#")) return null;

  const moxMatch = trimmed.match(MOXFIELD_LINE);
  if (moxMatch) {
    return {
      quantity: parseQuantity(moxMatch[1]),
      name: cleanName(moxMatch[2]),
      set: moxMatch[3].toLowerCase(),
      collectorNumber: moxMatch[4],
    };
  }

  const qtyMatch = trimmed.match(QUANTITY_FIRST);
  if (qtyMatch) {
    return {
      quantity: parseQuantity(qtyMatch[1]),
      name: cleanName(qtyMatch[2]),
    };
  }

  const nameMatch = trimmed.match(NAME_FIRST);
  if (nameMatch) {
    return {
      name: cleanName(nameMatch[1]),
      quantity: parseQuantity(nameMatch[2]),
    };
  }

  const parts = splitCsvLine(trimmed);
  if (parts.length >= 2) {
    const a = parts[0];
    const b = parts[1];
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);

    if (aNum && !bNum) {
      const entry: CollectionEntry = {
        quantity: parseQuantity(a),
        name: cleanName(b),
      };
      if (parts[2]) entry.set = parts[2].trim();
      if (parts[3]) entry.collectorNumber = parts[3].trim();
      return entry;
    }
    if (!aNum && bNum) {
      const entry: CollectionEntry = {
        name: cleanName(a),
        quantity: parseQuantity(b),
      };
      if (parts[2]) entry.set = parts[2].trim();
      if (parts[3]) entry.collectorNumber = parts[3].trim();
      return entry;
    }

    return {
      name: cleanName(`${a} ${b}`),
      quantity: parts[2] && /^\d+$/.test(parts[2]) ? parseQuantity(parts[2]) : 1,
    };
  }

  return { name: cleanName(trimmed), quantity: 1 };
}

export function parseCollectionText(text: string): CollectionEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: CollectionEntry[] = [];

  for (const line of lines) {
    const entry = parseLine(line);
    if (entry) entries.push(entry);
  }

  return mergeDuplicates(entries);
}

function mergeDuplicates(entries: CollectionEntry[]): CollectionEntry[] {
  const map = new Map<string, CollectionEntry>();

  for (const entry of entries) {
    const key = entry.set && entry.collectorNumber
      ? nameKey(`${entry.set}:${entry.collectorNumber}:${entry.name}`)
      : nameKey(entry.name);

    const existing = map.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      map.set(key, { ...entry });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type PromptListEntry = {
  name: string;
  quantity: number;
  typeLine?: string;
  colors?: string[];
  cmc?: number;
  /** Raw mana cost like "{2}{R}{R}" — informs colored-mana requirements. */
  manaCost?: string;
  oracleText?: string;
  /** e.g. ["Flying", "Vigilance"] — a cheap card-shape signal. */
  keywords?: string[];
  power?: string;
  toughness?: string;
  /** "common" | "uncommon" | "rare" | "mythic" — informs card power. */
  rarity?: string;
};

const ORACLE_TRUNCATE = 160;

/**
 * Squash oracle text into a single short line. Newlines and reminder text
 * (parenthetical) waste tokens; the AI only needs the gist.
 */
function condenseOracle(text: string): string {
  const stripped = text
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped.length <= ORACLE_TRUNCATE) return stripped;
  return `${stripped.slice(0, ORACLE_TRUNCATE - 1).trimEnd()}…`;
}

/**
 * Format a single owned card for the AI prompt. Includes the data the model
 * actually needs to evaluate a card's power: mana cost (for colored
 * requirements, not just CMC), oracle text (truncated), P/T for creatures,
 * and rarity as a coarse strength signal. Before this richer encoding the
 * AI was picking cards purely from name recall, which produced consistently
 * weak decks.
 */
export function formatPromptCardLine(e: PromptListEntry): string {
  const cmcTag =
    typeof e.cmc === "number" && Number.isFinite(e.cmc) ? `cmc ${e.cmc}` : null;
  const costTag = e.manaCost && e.manaCost.length <= 24 ? e.manaCost : null;
  const colorTagStr = e.colors?.length ? `[${e.colors.join("")}]` : null;
  const ptTag =
    e.power !== undefined && e.toughness !== undefined
      ? `${e.power}/${e.toughness}`
      : null;
  const rarityTag =
    e.rarity && e.rarity !== "common" ? e.rarity.toUpperCase()[0] : null;
  const head = [costTag, cmcTag, e.typeLine, ptTag, colorTagStr, rarityTag]
    .filter(Boolean)
    .join(" ");

  let body = "";
  const kw = e.keywords?.filter((k) => k && k.length).slice(0, 6) ?? [];
  if (kw.length) body += ` ${kw.join(", ")}.`;
  if (e.oracleText) {
    const oracle = condenseOracle(e.oracleText);
    if (oracle) body += ` ${oracle}`;
  }
  body = body.replace(/\s+/g, " ").trim();

  return `- ${e.quantity}x ${e.name}${head ? ` (${head})` : ""}${body ? ` — ${body}` : ""}`;
}

export function collectionToPromptList(entries: PromptListEntry[]): string {
  return entries.map(formatPromptCardLine).join("\n");
}
