import type { LegalityStatus, ScryfallCard } from "./types";

/**
 * Basic lands are unlimited in real Magic, but collection exports
 * (Moxfield, Archidekt, etc.) often omit them since they're free.
 * We inject these stubs into the owned index so the deck builder can
 * always use basics for mana fixing, even if the upload didn't list them.
 *
 * IDs below are real, live Scryfall card IDs so image URLs resolve to
 * real card art.
 */

const ALL_LEGAL: Record<string, LegalityStatus> = {
  standard: "legal",
  modern: "legal",
  pioneer: "legal",
  pauper: "legal",
  commander: "legal",
};

function basic(
  id: string,
  name: string,
  colorLetter: string,
  oracleAbility: string,
): ScryfallCard {
  const first = id[0];
  const second = id[1];
  return {
    id,
    name,
    cmc: 0,
    type_line: `Basic Land — ${name}`,
    oracle_text: oracleAbility,
    colors: [],
    color_identity: colorLetter ? [colorLetter] : [],
    legalities: ALL_LEGAL,
    set: "hob",
    set_name: "Heads I Win, Tails You Lose",
    rarity: "common",
    layout: "normal",
    image_uris: {
      small: `https://cards.scryfall.io/small/front/${first}/${second}/${id}.jpg`,
      normal: `https://cards.scryfall.io/normal/front/${first}/${second}/${id}.jpg`,
      large: `https://cards.scryfall.io/large/front/${first}/${second}/${id}.jpg`,
    },
    keywords: [],
    prices: { usd: "0.10", usd_foil: null, eur: "0.10" },
  };
}

export const STUB_BASIC_LANDS: ScryfallCard[] = [
  basic("24dc369c-020a-4115-a4bb-d60a44de64e3", "Plains", "W", "({T}: Add {W}.)"),
  basic("739aaaac-c424-4ea7-a084-62a6fc0438b0", "Island", "U", "({T}: Add {U}.)"),
  basic("c5f590a3-9993-4ac4-a93c-1beb44eda17b", "Swamp", "B", "({T}: Add {B}.)"),
  basic("51acfb01-4b0b-48fc-9704-a9b4a1e43a23", "Mountain", "R", "({T}: Add {R}.)"),
  basic("5f533364-0f91-4e49-aaeb-83c4c1f6d316", "Forest", "G", "({T}: Add {G}.)"),
];
