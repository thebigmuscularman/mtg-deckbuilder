/**
 * Four discrete power tiers loosely aligned with the WotC Commander Bracket
 * system. We use four buckets instead of a slider because "power" is fuzzy:
 * a slider implies precision the AI can't really deliver, whereas buckets
 * map cleanly to concrete do's and don'ts in the prompt.
 */
export type PowerLevelId = "casual" | "focused" | "optimized" | "high";

export interface PowerLevelMeta {
  id: PowerLevelId;
  label: string;
  short: string;
  bracket: string;
  hint: string;
}

export const POWER_LEVELS: Record<PowerLevelId, PowerLevelMeta> = {
  casual: {
    id: "casual",
    label: "Casual",
    short: "Kitchen table",
    bracket: "Bracket 1–2",
    hint: "Battlecruiser games, jank welcome, no infinite combos, no fast mana.",
  },
  focused: {
    id: "focused",
    label: "Focused",
    short: "Upgraded precon",
    bracket: "Bracket 2–3",
    hint: "Coherent game plan, light interaction, occasional combo line — but no turbo wins.",
  },
  optimized: {
    id: "optimized",
    label: "Optimized",
    short: "Tuned & efficient",
    bracket: "Bracket 3–4",
    hint: "Fast mana, tutors, and a real combo finish are fair game. Aiming to win, not stomp.",
  },
  high: {
    id: "high",
    label: "High Power",
    short: "cEDH-adjacent",
    bracket: "Bracket 4–5",
    hint: "All gloves off: turn 3–5 wins, max efficiency, every staple.",
  },
};

export const DEFAULT_POWER_LEVEL: PowerLevelId = "focused";

const COMMON_PROMPT_PREAMBLE = `*** POWER LEVEL — HARD CONSTRAINT ***
The user has chosen a target power level. Every choice (commander, mainboard, mana base, sideboard) must respect it. Going over the level is just as bad as going under. Power level is about INTENT, not just card list — a "casual" deck still has answers and a plan, it just doesn't grind the table into dust on turn 4.`;

const PROMPT_BLOCKS: Record<PowerLevelId, string> = {
  casual: `${COMMON_PROMPT_PREAMBLE}
Target: CASUAL (kitchen table / battlecruiser, ~Bracket 1–2).

Lean into this:
- Fun, splashy, big effects. Mid-to-late game payoffs are great.
- Curve toward 3-5+ mana plays. Build-around enchantments, tribal payoffs, and signature cards are encouraged.
- Linear synergies are fine; the deck should have a recognizable theme.

Avoid these even if the card pool contains them:
- Fast mana: Sol Ring, Mana Crypt, Mana Vault, Chrome Mox, Mox Diamond, Jeweled Lotus, Grim Monolith.
- Hard tutors: Demonic Tutor, Vampiric Tutor, Imperial Seal, Mystical Tutor, Enlightened Tutor, Worldly Tutor, Gamble. (Lesser tutors like Diabolic Tutor or transmute are acceptable.)
- Two-card infinite combos that win the game (Thassa's Oracle + Demonic Consultation, Isochron Scepter + Dramatic Reversal mana, Heliod + Ballista, etc.).
- Mass land destruction (Armageddon, Ravages of War, Jokulhaups) unless the deck's whole gimmick is to recover from it.
- Stax pieces that lock the table (Winter Orb, Stasis, Static Orb, Smokestack) — one or two soft taxes is fine.
- Free counterspells (Force of Will, Force of Negation, Fierce Guardianship) as default removal.
- Extra-turn spam beyond 1–2 copies.

A casual deck still includes ~6–10 interaction pieces (removal, counterspells, board wipes). It just doesn't try to combo on turn 4.`,

  focused: `${COMMON_PROMPT_PREAMBLE}
Target: FOCUSED (upgraded-precon level, ~Bracket 2–3).

This is the meaty middle. The deck should:
- Have a clear game plan and execute it consistently by turn 6–8.
- Run real removal, counter magic, or board wipes (~8–12 pieces).
- Include up to TWO tutors total (cheap targeted ones like Eldritch Evolution, Chord of Calling, Diabolic Tutor are best).
- Include AT MOST one Sol Ring; no other fast mana.
- Include up to ONE two-card infinite combo as an alternate win, only if the deck has a coherent fair plan first.

Avoid:
- Multiple unconditional tutors (Demonic Tutor + Vampiric Tutor + Imperial Seal at once).
- Free counterspells as the default answer suite.
- Mass land destruction.
- Hard stax locks.`,

  optimized: `${COMMON_PROMPT_PREAMBLE}
Target: OPTIMIZED (tuned and efficient, ~Bracket 3–4).

Aim to win on a fast clock against a focused table:
- Lean into fast mana (Sol Ring, Mana Crypt, Mana Vault, Mox Diamond, Chrome Mox if present).
- Include 3-6 efficient tutors (Demonic Tutor, Vampiric Tutor, Mystical Tutor, Enlightened Tutor, Worldly Tutor, Imperial Seal).
- Free interaction (Force of Will, Force of Negation, Fierce Guardianship, Deflecting Swat, Mana Drain) is welcome.
- One or two real combo win lines are expected, but the deck should also be able to win through a normal beatdown / control plan.
- Curve sub-2.5 average CMC where possible.
- Keep the mana base tight: every fetch, shock, dual, and utility land available in the collection is in play.

Avoid:
- Battlecruiser 7-drops that don't immediately threaten the game.
- Filler creatures whose only job is "be a body".`,

  high: `${COMMON_PROMPT_PREAMBLE}
Target: HIGH POWER / cEDH-ADJACENT (~Bracket 4–5).

Build to win on turn 3-5 against three other powerful decks:
- Maximum fast mana, maximum free interaction, maximum tutors. Every staple the collection contains should be considered.
- Two compact, redundantly-tutorable combo lines (e.g. Thoracle + Consultation/Pact, Isochron + Dramatic Reversal, Underworld Breach + LED, Kiki/Splinter Twin lines).
- 1-CMC interaction is preferred over 2+ CMC where available.
- Land count can dip to 30 in Commander if the deck has 12+ pieces of fast mana / rocks (but the user's slider, if set, overrides this).
- Curve should be brutally low; if a card costs 4+ it must be a haymaker that immediately wins or stops a win.
- Stax pieces are fine where they help the deck's plan more than they hurt it.

No card from the collection is off-limits at this level.`,
};

export function getPowerPromptBlock(id: PowerLevelId | undefined): string | null {
  if (!id) return null;
  return PROMPT_BLOCKS[id] ?? null;
}

export function isPowerLevelId(value: unknown): value is PowerLevelId {
  return (
    value === "casual" ||
    value === "focused" ||
    value === "optimized" ||
    value === "high"
  );
}
