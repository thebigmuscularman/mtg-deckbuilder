export const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export const WUBRG = ["W", "U", "B", "R", "G"];

export function sortWubrg(ci: string[]): string[] {
  return [...ci].sort((a, b) => WUBRG.indexOf(a) - WUBRG.indexOf(b));
}

export function colorTag(ci: string[]): string {
  if (!ci.length) return "C";
  return sortWubrg(ci).join("");
}

export function formatColorIdentity(ci: string[]): string {
  if (!ci.length) return "Colorless (C)";
  const sorted = sortWubrg(ci);
  return `${sorted.join("")} (${sorted.map((c) => COLOR_NAMES[c] ?? c).join("/")})`;
}
