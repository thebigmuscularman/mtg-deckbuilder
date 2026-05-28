import type { BuiltDeck } from "./types";

function linesToText(lines: Array<{ quantity: number; name: string }>): string[] {
  return lines.map((l) => `${l.quantity} ${l.name}`);
}

/** Moxfield / Manabox plain text */
export function toMoxfieldText(deck: BuiltDeck): string {
  const out: string[] = [];
  if (deck.commander) out.push(`1 ${deck.commander} *CMDR*`);
  for (const l of deck.mainboard) out.push(`${l.quantity} ${l.name}`);
  if (deck.sideboard.length) {
    out.push("");
    out.push("// Sideboard");
    for (const l of deck.sideboard) out.push(`${l.quantity} ${l.name}`);
  }
  return out.join("\n");
}

/** Archidekt bulk import (similar to Moxfield) */
export function toArchidektText(deck: BuiltDeck): string {
  return toMoxfieldText(deck);
}

/** MTGA collection import style (simplified) */
export function toMtgaText(deck: BuiltDeck): string {
  const counts = new Map<string, number>();
  const add = (name: string, qty: number) => {
    const key = name.trim();
    counts.set(key, (counts.get(key) ?? 0) + qty);
  };
  if (deck.commander) add(deck.commander, 1);
  for (const l of deck.mainboard) add(l.name, l.quantity);
  for (const l of deck.sideboard) add(l.name, l.quantity);
  return [...counts.entries()].map(([name, qty]) => `${qty} ${name}`).join("\n");
}

export function toPlainDecklist(deck: BuiltDeck): string {
  const lines: string[] = [
    `# ${deck.name}`,
    `# ${deck.description}`,
    "",
  ];
  if (deck.commander) lines.push(`Commander\n1 ${deck.commander}\n`);
  lines.push("Maindeck");
  lines.push(...linesToText(deck.mainboard));
  if (deck.sideboard.length) {
    lines.push("\nSideboard");
    lines.push(...linesToText(deck.sideboard));
  }
  return lines.join("\n");
}

export type ExportFormat = "moxfield" | "archidekt" | "mtga" | "plain";

export function exportDeck(deck: BuiltDeck, format: ExportFormat): string {
  switch (format) {
    case "moxfield":
      return toMoxfieldText(deck);
    case "archidekt":
      return toArchidektText(deck);
    case "mtga":
      return toMtgaText(deck);
    default:
      return toPlainDecklist(deck);
  }
}
