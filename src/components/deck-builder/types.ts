import type { BuiltDeck, ScryfallCard } from "@/lib/types";

export type Step = "upload" | "review" | "deck";
export type Color = "W" | "U" | "B" | "R" | "G";
export type UploadMode = "file" | "paste";

export type DeckResult = {
  deck: BuiltDeck;
  enriched: {
    mainboard: Array<{ name: string; quantity: number; card: ScryfallCard | null }>;
    sideboard: Array<{ name: string; quantity: number; card: ScryfallCard | null }>;
    commander: ScryfallCard | null;
  };
  validation: { valid: boolean; errors: string[]; warnings: string[] };
};

export const COLOR_META: Record<
  Color,
  { name: string; bg: string; ring: string; text: string; ms: string; pip: string }
> = {
  W: { name: "White", bg: "bg-yellow-50", ring: "ring-yellow-200", text: "text-yellow-900", ms: "ms-w", pip: "bg-[#fdfbce] text-[#7c5e0a]" },
  U: { name: "Blue", bg: "bg-sky-300", ring: "ring-sky-400", text: "text-sky-950", ms: "ms-u", pip: "bg-[#bcdaf7] text-[#0c4a6e]" },
  B: { name: "Black", bg: "bg-stone-800", ring: "ring-stone-600", text: "text-stone-100", ms: "ms-b", pip: "bg-[#1f1d1c] text-[#d6c4cb] ring-1 ring-stone-600" },
  R: { name: "Red", bg: "bg-red-400", ring: "ring-red-500", text: "text-red-950", ms: "ms-r", pip: "bg-[#f19b79] text-[#7c2d12]" },
  G: { name: "Green", bg: "bg-green-400", ring: "ring-green-500", text: "text-green-950", ms: "ms-g", pip: "bg-[#9fcba6] text-[#14532d]" },
};

export const BUILD_VARIANTS = [
  { label: "Aggro", hint: "Build an aggressive deck — low curve, max pressure, fast wins." },
  { label: "Midrange", hint: "Build a midrange deck — resilient two-for-ones, flexible interaction." },
  { label: "Control", hint: "Build a control deck — removal, card draw, late-game finishers." },
] as const;

export function parseSseChunk(buffer: string): {
  events: Array<{ event: string; data: string }>;
  rest: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let event = "message";
    let data = "";
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (data) events.push({ event, data });
  }
  return { events, rest };
}
