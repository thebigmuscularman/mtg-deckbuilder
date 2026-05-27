import type { ScryfallCard } from "./types";

export const TYPE_SECTION_ORDER = [
  "Commander",
  "Planeswalkers",
  "Creatures",
  "Instants",
  "Sorceries",
  "Enchantments",
  "Artifacts",
  "Battles",
  "Lands",
  "Other",
] as const;

export type TypeSection = (typeof TYPE_SECTION_ORDER)[number];

export function classifyTypeSection(typeLine: string): TypeSection {
  const t = typeLine.toLowerCase();
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("creature")) return "Creatures";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("enchantment")) return "Enchantments";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("battle")) return "Battles";
  if (t.includes("land")) return "Lands";
  return "Other";
}

export function groupLinesByType<T extends { name: string; card: ScryfallCard | null }>(
  lines: T[],
  options?: { commanderName?: string | null },
): Array<{ section: TypeSection; lines: T[] }> {
  const buckets = new Map<TypeSection, T[]>();

  for (const line of lines) {
    const section =
      options?.commanderName &&
      line.name.toLowerCase() === options.commanderName.toLowerCase()
        ? "Commander"
        : classifyTypeSection(line.card?.type_line ?? "");
    const list = buckets.get(section) ?? [];
    list.push(line);
    buckets.set(section, list);
  }

  return TYPE_SECTION_ORDER.filter((s) => buckets.has(s))
    .map((section) => ({
      section,
      lines: [...(buckets.get(section) ?? [])].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
}
