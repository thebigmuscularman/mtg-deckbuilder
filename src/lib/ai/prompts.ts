import { formatRulesPrompt } from "../formats";
import type { FormatId, ResolvedCollectionCard } from "../types";
import { buildPreferencesPromptBlock, type DeckBuildPreferences } from "../deck-preferences";
import { getPowerPromptBlock } from "../power-levels";
import { buildCollectionContext, buildColorInventory } from "./collection-prompt";
import { formatColorIdentity, sortWubrg } from "./color-utils";

export function systemPrompt(
  format: FormatId,
  landsTargetOverride?: number,
): string {
  const singletonReminder =
    format === "commander"
      ? `\n- COMMANDER SINGLETON: Every non-basic card may appear AT MOST 1 time in the entire deck. The collection list shows each non-basic as "1x" for this reason. Do NOT use 2x, 3x, or 4x of any non-basic card. The ONLY cards you may repeat are basic lands (Plains, Island, Swamp, Mountain, Forest, Wastes).
- USE THE FULL COMMANDER COLOR IDENTITY: If the commander is multicolor, the deck MUST contain meaningful cards from EVERY color in its identity, plus a mana base that produces every color. Do not silently collapse a 2-color commander into a mono-color deck. The user picked multicolor for a reason — honor it.`
      : "";

  return `You are an expert Magic: The Gathering deck architect.

You build COMPLETE, playable, competitive-leaning decks using ONLY cards from the user's collection list.

ABSOLUTE RULES — violating any of these will cause the deck to be auto-trimmed and look bad to the user:
- Use ONLY cards whose exact names appear in the collection list below.
- The collection lists each card prefixed with "Nx" — that is the MAXIMUM number of copies of that card you may use across mainboard + sideboard + commander combined. Never exceed it.
- If you need more of a card than the user owns, pick a DIFFERENT card from the collection instead of asking for more copies.
- Never invent, hallucinate, or guess at cards. If a card you want isn't listed, don't include it.
- The sum of all mainboard quantities MUST equal the exact mainboard size for the format. Count carefully before responding. Do not overshoot or undershoot by even one card.
- For Commander, the mainboard is EXACTLY 99 cards (the commander is separate). For Standard/Modern, the mainboard is EXACTLY 60 cards.${singletonReminder}

${formatRulesPrompt(format, landsTargetOverride)}

Design principles:
- Include a coherent game plan (aggro, control, midrange, combo, etc.)
- READ THE ORACLE TEXT. Every card in the collection list below shows its mana cost, type, P/T, keywords, and a condensed oracle text. Use that data — do not pick cards from memory of names alone. Compare candidates: a card that "draws 2 cards" beats a card that "draws 1 card" for the same cost. A 4/4 for 3 beats a 2/2 for 3. Spells that do MORE per mana spent are stronger; pick the most efficient option for each role.
- BUILD AROUND SYNERGIES. After picking your commander or core strategy, scan the oracle text of EVERY listed card and pull out cards that explicitly reinforce the plan: tribal lords for a tribal deck, sacrifice payoffs for a sac deck, +1/+1 counter payoffs for a counters deck, reanimation targets for a reanimator deck, etc. Filler is the enemy — every slot should either advance the plan or answer the opponents.
- AVOID FILLER. A "vanilla" 2/2 for 2 with no abilities is almost never correct over a 2-drop with relevant text. If a card's oracle text is empty or generic, it had better be a key role-player (mana, removal, finisher) or the slot is wasted.
- INTERACTION IS NOT OPTIONAL. Commander needs ~10–14 removal/counter/wipe pieces; 60-card formats need ~6–10. A deck with 0 removal will lose to the first threat it can't block. Pick the most efficient interaction the collection offers (Swords to Plowshares > Murder; Counterspell > Cancel; Wrath of God > Volcanic Fallout in most decks).
- Build a real mana base. The deck MUST hit the minimum land count for the format (see format rules below). When in doubt, ADD MORE LANDS. A deck with 6–15 lands is broken; do not ship it. Basic lands are unlimited — always backfill with basics if non-basic lands are scarce in the collection.
- Build a real mana curve. Each card lists its converted mana cost. Follow the curve target in the format rules below. The deck must have meaningful plays at 1–2 mana, a healthy two/three-drop core, and only a few cards above 5 mana. A list that's all 4-plus drops or all 1-drops will lose every game.
- For Commander: pick the best commander from the collection for the available card pool; explain the synergy
- For 60-card formats: target exactly 60 mainboard cards; sideboard 0-15 if useful
- Use exact English card names as they appear on Scryfall
- For ANY multi-color deck (whether by commander or user-requested combo), PRIORITIZE multicolor cards (gold cards, hybrid cards) over mono-color staples. Multicolor cards justify the color commitment and are the signature payoffs of running multiple colors — they should make up a meaningful fraction of every multi-color deck, not be afterthoughts.

For EVERY card you include (mainboard, sideboard, and commander) give a short "reason" (one sentence, 8-20 words) explaining why it earns its slot in THIS deck — its role, synergy, or matchup it answers. Be specific to the deck's plan, not generic.

Respond with JSON only matching this schema:
{
  "name": "deck name (evocative, 2-5 words)",
  "description": "one-sentence hook describing the deck's vibe",
  "archetype": "Aggro | Midrange | Control | Combo | Tempo | Tribal | Ramp | Voltron | Tokens | Stax | Reanimator | Etc.",
  "overview": "2-3 sentence paragraph: what the deck does, how it wins, and what makes it fun or powerful. Written for the deck owner, not generic.",
  "winConditions": ["concrete way 1 the deck wins", "concrete way 2", "concrete way 3"],
  "strengths": ["specific strength 1 (3-8 words)", "specific strength 2", "specific strength 3"],
  "weaknesses": ["honest matchup or vulnerability 1", "vulnerability 2", "vulnerability 3"],
  "commander": "Card Name or null",
  "commanderReason": "why this commander, or null",
  "mainboard": [{ "name": "Exact Card Name", "quantity": 4, "reason": "Cheap removal that swings tempo." }],
  "sideboard": [{ "name": "Exact Card Name", "quantity": 2, "reason": "Comes in vs aggro for early blockers." }],
  "strategy": "how to pilot the deck turn-by-turn: opening hand priorities, mulligan rules, mid-game plan, finishing sequence. 4-8 sentences.",
  "warnings": ["optional notes about missing pieces"]
}`;
}

export function buildBaseUserMessage(
  format: FormatId,
  resolved: ResolvedCollectionCard[],
  strategyHint?: string,
  colorPref?: string[],
  maxBudgetUsd?: number,
  brewPrefs?: DeckBuildPreferences,
): string {
  const prefColors = sortWubrg(
    (colorPref ?? []).filter((c) => "WUBRG".includes(c)),
  );
  const collectionContext = buildCollectionContext(resolved, format, prefColors);
  const unresolved = resolved.filter((r) => !r.card).map((r) => r.entry.name);

  const limitNote =
    format === "commander"
      ? `Each non-basic card below shows as 1x — that is the SINGLETON limit for Commander. Use AT MOST 1 copy of each. Only basic lands may repeat.

Each card lists its color identity in brackets, e.g. (Creature [UB]) means Blue+Black. Colorless cards show [C].

STEP 1: PICK THE COMMANDER FIRST. Pick a legendary creature whose color identity gives you the deepest, most cohesive card pool from the inventory below.

STEP 2: USE EVERY COLOR IN THE COMMANDER'S IDENTITY. If the commander is 2-color (e.g. [GW]) the deck MUST meaningfully use BOTH Green and White cards — not just one. If it's 3-color, use all three. A multicolor commander piloting a mono-color deck is a FAILED build.

STEP 3: COLOR LEGALITY. Every card's bracket letters must be a SUBSET of the commander's letters. A card with [U] in a [GW] deck is ILLEGAL.

STEP 4: BALANCE THE MANA BASE. For a 2-color commander, the lands and ramp should produce both colors. Include multicolor lands and dual lands you own. Split basics roughly evenly across the commander's colors unless the strategy demands otherwise.

COLOR INVENTORY (unique cards you own by color identity):
${buildColorInventory(resolved)}`
      : "Each card below shows the max copies you can use (capped at the format's 4-of rule). Never exceed those numbers.";

  let userMessage = `Build a ${format} deck from this collection.\n\n${limitNote}\n\nCOLLECTION:\n${collectionContext}`;

  if (prefColors.length) {
    const colorList = formatColorIdentity(prefColors);
    const tag = prefColors.join("");
    const multicolorEmphasis =
      prefColors.length >= 2
        ? `

*** MULTICOLOR PICKS ARE THE HEART OF THIS DECK ***
- The collection list shows a "MULTICOLOR SIGNATURE CARDS" section first — these cards use TWO OR MORE of your requested colors at once and are usually the strongest, most synergistic picks in a ${tag} deck.
- A well-built ${tag} deck is NOT a 50/50 split of mono-color cards. It leans HEAVILY on multicolor cards that justify the color commitment (gold cards, hybrid cards, multicolor dual lands).
- Aim for AT LEAST 8-15 multicolor cards in a 2-color Commander deck (more if more colors). For 60-card formats, include every playable multicolor signature card you own.
- If a multicolor card and a mono-color card are roughly equivalent in role, pick the multicolor card — it signals the deck's identity.`
        : "";
    const prefBlock =
      format === "commander"
        ? `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors for the deck: ${colorList}.
- The commander's color identity MUST be EXACTLY ${tag} (every requested color, no extras, no fewer).
- Every other card's color identity must be a SUBSET of {${prefColors.join(", ")}}.
- The mana base must produce all ${prefColors.length} requested color${prefColors.length === 1 ? "" : "s"}.
- Cards outside these colors are not even shown in the collection list below. Use only what's listed.${multicolorEmphasis}`
        : `\n\n*** USER COLOR REQUIREMENT — HIGHEST PRIORITY ***
The user has explicitly requested these colors: ${colorList}.
- Every card you include must have a color identity that is a SUBSET of {${prefColors.join(", ")}}.
- The mana base must reliably produce all ${prefColors.length} requested color${prefColors.length === 1 ? "" : "s"}.
- Cards outside these colors are not even shown in the collection list below.${multicolorEmphasis}`;
    userMessage += prefBlock;
  }

  if (maxBudgetUsd && maxBudgetUsd > 0) {
    userMessage += `\n\n*** BUDGET CAP — $${maxBudgetUsd} USD per card (Scryfall nonfoil) ***
- Do not include any card whose typical price exceeds $${maxBudgetUsd}.
- Prefer budget-friendly alternatives from the collection. Basic lands are always allowed.`;
  }

  const powerBlock = getPowerPromptBlock(brewPrefs?.powerLevel);
  if (powerBlock) {
    userMessage += `\n\n${powerBlock}`;
  }

  const prefsBlock = buildPreferencesPromptBlock(format, brewPrefs ?? {});
  if (prefsBlock) {
    userMessage += `\n\n${prefsBlock}`;
  }

  if (strategyHint?.trim()) {
    userMessage += `\n\nUser preference: ${strategyHint.trim()}`;
  }
  if (unresolved.length) {
    userMessage += `\n\nNote: these collection lines could not be resolved on Scryfall — do NOT use them: ${unresolved.join(", ")}`;
  }
  return userMessage;
}