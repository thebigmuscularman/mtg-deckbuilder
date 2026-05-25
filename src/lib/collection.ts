import type { CollectionEntry } from "./types";

const QUANTITY_FIRST = /^(\d+)\s*[xX]?\s+(.+)$/;
const NAME_FIRST = /^(.+?)\s*[xX](\d+)$/;

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
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

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

export function parseCollectionFile(content: string, filename: string): CollectionEntry[] {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt")) {
    return parseCollectionText(content);
  }
  throw new Error("Unsupported file type. Upload a .txt file.");
}

function mergeDuplicates(entries: CollectionEntry[]): CollectionEntry[] {
  const map = new Map<string, CollectionEntry>();

  for (const entry of entries) {
    const key = entry.set && entry.collectorNumber
      ? `${entry.set}:${entry.collectorNumber}:${entry.name}`.toLowerCase()
      : entry.name.toLowerCase();

    const existing = map.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      map.set(key, { ...entry });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function collectionToPromptList(
  entries: Array<{ name: string; quantity: number; typeLine?: string; colors?: string[] }>,
): string {
  return entries
    .map((e) => {
      const meta = [
        e.typeLine,
        e.colors?.length ? `[${e.colors.join("")}]` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return `- ${e.quantity}x ${e.name}${meta ? ` (${meta})` : ""}`;
    })
    .join("\n");
}
