import { nameKey } from "./scryfall";

/** Exact card names (normalized) — avoids substring false positives like Wildfire Devils. */
function keys(...names: string[]): Set<string> {
  return new Set(names.map((n) => nameKey(n)));
}

export const MLD_CARD_KEYS = keys(
  "Armageddon",
  "Ravages of War",
  "Jokulhaups",
  "Obliterate",
  "Fall of the Thran",
  "Wildfire",
  "Catastrophe",
  "Boom // Bust",
  "Impending Disaster",
  "Worldfire",
  "Sunder",
  "From the Ashes",
);

export const COMBO_CARD_KEYS = keys(
  "Thassa's Oracle",
  "Demonic Consultation",
  "Tainted Pact",
  "Isochron Scepter",
  "Dramatic Reversal",
  "Heliod, Sun-Crowned",
  "Walking Ballista",
  "Kiki-Jiki, Mirror Breaker",
  "Splinter Twin",
  "Underworld Breach",
  "Laboratory Maniac",
  "Doomsday",
  "Protean Hulk",
  "Flash",
  "Hermit Druid",
  "Food Chain",
  "Necrotic Ooze",
  "Mikaeus, the Unhallowed",
  "Triskelion",
  "Aetherflux Reservoir",
  "Approach of the Second Sun",
);

export const EXTRA_TURN_CARD_KEYS = keys(
  "Time Warp",
  "Temporal Manipulation",
  "Capture of Jingzhou",
  "Alrund's Epiphany",
  "Expropriate",
  "Nexus of Fate",
  "Temporal Trespass",
  "Karn's Temporal Sundering",
  "Part the Waterveil",
  "Walk the Aeons",
  "Time Stretch",
);

export function isExactCardName(name: string, set: Set<string>): boolean {
  return set.has(nameKey(name));
}
