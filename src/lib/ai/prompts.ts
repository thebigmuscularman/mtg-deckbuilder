import { formatRulesPrompt } from "../formats";
import type { FormatId, ResolvedCollectionCard } from "../types";
import { buildPreferencesPromptBlock, type DeckBuildPreferences } from "../deck-preferences";
import { getPowerPromptBlock } from "../power-levels";
import { buildCollectionContext, buildColorInventory } from "./collection-prompt";
import { formatColorIdentity, sortWubrg } from "./color-utils";

/**
 * Stage-1 system prompt. The AI's only job here is to produce a strategic plan
 * — a commander pick, archetype, win conditions, key cards from the collection,
 * and role-count budget. NO full deck list. Stage 2 then executes against the
 * plan in a separate call, so card picks are forced to serve a stated strategy
 * instead of being chosen by vibes.
 */
export function planSystemPrompt(
  format: FormatId,
  chosenCommander?: string,
): string {
  const lockedCommander =
    format === "commander" && chosenCommander?.trim()
      ? chosenCommander.trim()
      : null;
  const commanderClause =
    format === "commander"
      ? lockedCommander
        ? `
- The commander is FIXED by the user: "${lockedCommander}". Set "commander" to exactly that string. Do NOT pick a different commander.
- The deck's color identity is locked to ${lockedCommander}'s color identity. Build the plan, key cards, and archetype AROUND this commander; choose synergies that reward what ${lockedCommander} does.`
        : `
- You MUST pick a legendary creature from the collection as the commander. Its color identity defines the deck's color identity.
- Pick the commander whose color identity gives you the deepest, most synergistic card pool — read the oracle text of candidates AND the cards in their color identity.`
      : `
- "commander" should be null for ${format} format.`;

  const totalCards = format === "commander" ? 99 : 60;

  return `You are an expert Magic: The Gathering deck architect. You are doing STEP 1 of TWO: planning the deck.

Do NOT list the full deck in this step. Output ONLY a strategic plan. The actual 99-card / 60-card list is built in step 2 against your plan.

Your plan must be specific, opinionated, and rooted in the actual collection. Read the oracle text of cards in the collection list — pick the commander and key cards that have the strongest synergies you can see in this player's actual card pool.${commanderClause}

Output JSON only matching this schema:
{
  "commander": ${lockedCommander ? `"${lockedCommander}" (fixed)` : `"Card Name (must be in the collection) or null"`},
  "commanderRationale": "1-2 sentences: why this commander given the available cards",
  "archetype": "Aggro | Midrange | Control | Combo | Tempo | Tribal | Ramp | Voltron | Tokens | Stax | Reanimator | Group Hug | etc.",
  "archetypeTagline": "1 sentence describing what the deck DOES",
  "winConditions": ["specific path 1", "specific path 2", "specific path 3 (optional)"],
  "keyCards": ["8-15 specific card names from the collection that ANCHOR the plan — payoffs, signature pieces, must-include enablers"],
  "roleCounts": {
    "lands": <int>,
    "ramp": <int>,
    "removal": <int>,
    "cardDraw": <int>,
    "threats": <int>,
    "payoffs": <int>,
    "utility": <int>
  },
  "buildNotes": "1-3 sentences of guidance for step 2: curve target, key interactions to favor, things to avoid"
}

ROLE COUNT RULES:
- The sum of lands + ramp + removal + cardDraw + threats + payoffs + utility MUST equal ${totalCards} for ${format} format.
- Lands target: see format-specific land count guidance you've been given (Commander: ~35-37, 60-card: ~22-25). If the user set an explicit lands target, honor it.
- Ramp: mana acceleration (Commander typically 8-12; 60-card 0-4)
- Removal: spot removal + counters + wipes (Commander 8-12; 60-card 6-10)
- Card draw: card advantage engines (Commander 6-10; 60-card 4-8)
- Threats: creatures/planeswalkers that pressure life or board (varies by archetype)
- Payoffs: synergy cards that reward your specific plan (combo pieces, tribal lords, sac payoffs, etc.)
- Utility: tutors, recursion, protection, flex slots

KEY CARDS RULES:
- Must be EXACT names from the collection list.
- Pick cards with strong, specific oracle text relevant to your archetype, not generic 2/2s.
- These are the cards step 2 MUST include — be ruthless and only pick anchors.

Do not output anything except the JSON.`;
}

export function planUserPrompt(
  format: FormatId,
  collectionContext: string,
  prefColors: string[],
  brief?: string,
  chosenCommander?: string,
): string {
  const colorLine = prefColors.length
    ? `User color preference: ${prefColors.join("")} (every card's color identity must be a subset).`
    : "User has not specified colors — pick the ones with the deepest synergy in this collection.";
  const briefLine = brief?.trim()
    ? `\n\nUSER BRIEF (honor this above generic best-of advice):\n"${brief.trim()}"`
    : "";
  const commanderLine =
    format === "commander" && chosenCommander?.trim()
      ? `\n\nUSER-CHOSEN COMMANDER (fixed — do not change): "${chosenCommander.trim()}". Build the plan around this card; its color identity defines the deck's identity.`
      : "";
  return `Format: ${format}. ${colorLine}${commanderLine}${briefLine}

COLLECTION (each card shows mana cost, type, P/T, keywords, condensed oracle text). Read the oracle text — these are the only cards you may key off:

${collectionContext}

Now produce the strategic plan as JSON.`;
}

export function buildExecutionUserMessage(
  plan: string,
  format: FormatId,
): string {
  const mainSize = format === "commander" ? 99 : 60;
  const commanderNote =
    format === "commander"
      ? " (the commander itself is a SEPARATE field — do not include it in the 99)"
      : "";
  return `Now execute STEP 2: build the full deck list that matches the plan you just produced.

LOCKED-IN PLAN (this is your previous output — do not change it, build to it):
${plan}

*** HARD SIZE REQUIREMENT — NON-NEGOTIABLE ***
The "mainboard" array MUST sum to EXACTLY ${mainSize} cards${commanderNote}.
Before you finish writing JSON, ADD UP every "quantity" in your mainboard array. If the total is not ${mainSize}, you MUST add or remove cards until it is. A wrong count will be REJECTED and the user will see an error — no padding, no warnings, no "close enough". Fill every slot from the collection; basic lands (Plains, Island, Swamp, Mountain, Forest) are always available if you need to round out the mana base.

EXECUTION RULES:
- Mainboard quantity sum = ${mainSize}. Count it. If it's not ${mainSize}, fix it before responding.
- The commander above is fixed (Commander format only).
- EVERY card in keyCards MUST appear in your mainboard. They are the anchors.
- The mainboard role split should match roleCounts (lands, ramp, removal, cardDraw, threats, payoffs, utility — sum equals ${mainSize}).
- Pick the MOST EFFICIENT card from the collection for each role slot. Use the oracle text and cmc data to compare candidates.
- For each card you include, write a one-sentence "reason" (8-20 words) tying that card to the plan — its role and how it serves the win conditions or counters opponents. NOT generic.

Output JSON matching the full deck schema you've already been given. Do not output the plan again — it's locked in. Just the deck JSON, with mainboard summing to EXACTLY ${mainSize}.`;
}

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
- Before you finish writing JSON, ADD UP every "quantity" in your mainboard array. If the total is not the format's exact size, FIX IT — add or remove cards yourself. A wrong count will be REJECTED and the user will see an error. Basic lands (Plains, Island, Swamp, Mountain, Forest) are always available — add them to round out the mana base if you need filler.

${formatRulesPrompt(format, landsTargetOverride)}

Design principles (you'll have been given a locked-in plan from step 1; build to it):
- EXECUTE THE PLAN. Hit the roleCounts exactly (lands, ramp, removal, cardDraw, threats, payoffs, utility). Include every card in keyCards. Don't invent a different archetype.
- READ THE ORACLE TEXT. Each card listed below shows mana cost, type, P/T, keywords, and condensed oracle text. Compare candidates by what they actually do — "draws 2" > "draws 1" for the same cost; a 4/4 for 3 > a 2/2 for 3; conditional removal > unconditional removal only when the condition lines up with your plan.
- AVOID FILLER. A vanilla 2/2 for 2 is almost never correct. If a card's oracle text is empty or generic, it must be a critical role-player (mana, removal, finisher) or the slot is wasted.
- USE THE OWNED MANA BASE. If the collection has fetches, shocks, duals, or fixing lands that fit your colors, USE THEM. Only fall back to basics when fixing options run out.
- For ANY multi-color deck, prioritize multicolor cards over mono-color staples of equal effect — they justify the color commitment.
- For 60-card formats: target exactly 60 mainboard cards; sideboard 0-15 if useful.
- Use exact English card names as they appear in the collection list (also Scryfall-canonical).

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

  const chosenCommander =
    format === "commander" && brewPrefs?.chosenCommander?.trim()
      ? brewPrefs.chosenCommander.trim()
      : null;

  const commanderStep1 = chosenCommander
    ? `STEP 1: COMMANDER IS LOCKED. The user has chosen "${chosenCommander}" as the commander. Set the "commander" field to exactly that string and build the entire deck around it. Do NOT pick a different commander.`
    : `STEP 1: PICK THE COMMANDER FIRST. Pick a legendary creature whose color identity gives you the deepest, most cohesive card pool from the inventory below.`;

  const limitNote =
    format === "commander"
      ? `Each non-basic card below shows as 1x — that is the SINGLETON limit for Commander. Use AT MOST 1 copy of each. Only basic lands may repeat.

Each card lists its color identity in brackets, e.g. (Creature [UB]) means Blue+Black. Colorless cards show [C].

${commanderStep1}

STEP 2: USE EVERY COLOR IN THE COMMANDER'S IDENTITY. If the commander is 2-color (e.g. [GW]) the deck MUST meaningfully use BOTH Green and White cards — not just one. If it's 3-color, use all three. A multicolor commander piloting a mono-color deck is a FAILED build.

STEP 3: COLOR LEGALITY. Every card's bracket letters must be a SUBSET of the commander's letters. A card with [U] in a [GW] deck is ILLEGAL.

STEP 4: BALANCE THE MANA BASE. For a 2-color commander, the lands and ramp should produce both colors. Include multicolor lands and dual lands you own. Split basics roughly evenly across the commander's colors unless the strategy demands otherwise.

COLOR INVENTORY (unique cards you own by color identity):
${buildColorInventory(resolved)}`
      : "Each card below shows the max copies you can use (capped at the format's 4-of rule). Never exceed those numbers.";

  const mainSize = format === "commander" ? 99 : 60;
  let userMessage = `Build a ${format} deck from this collection.

*** DECK SIZE: mainboard quantities MUST sum to exactly ${mainSize} ***
Count every quantity in your mainboard before responding. Wrong size = rejected.

${limitNote}

COLLECTION:
${collectionContext}`;

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
    // The strategy field is now free-form prose, not a keyword list. Frame it
    // as the user's primary brief so the AI weighs it above generic best-of
    // picks — they may be telling us flavor, archetype, playgroup vibe, or
    // pet cards in a single paragraph.
    userMessage += `\n\n*** USER BRIEF — READ CAREFULLY AND HONOR IT ***
The user described what they want from this deck in their own words. Follow this intent FIRST; resolve any tension with generic "good cards" guidance by leaning toward what the user described:

"${strategyHint.trim()}"`;
  }
  if (unresolved.length) {
    userMessage += `\n\nNote: these collection lines could not be resolved on Scryfall — do NOT use them: ${unresolved.join(", ")}`;
  }
  return userMessage;
}