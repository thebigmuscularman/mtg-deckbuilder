/**
 * One-off stress test: resolve collection → build deck → print quality metrics.
 * Usage: node scripts/stress-test-build.mjs [modern|commander]
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const FETCH_MS = Number(process.env.FETCH_TIMEOUT_MS ?? 600_000);

async function apiFetch(url, init) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_MS);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

const MODERN_POOL = `
4 Lightning Bolt
4 Monastery Swiftspear
4 Goblin Guide
4 Eidolon of the Great Revel
4 Lava Spike
4 Rift Bolt
4 Skewer the Critics
4 Lightning Strike
4 Searing Blaze
4 Price of Progress
4 Inspiring Vantage
4 Sunbaked Canyon
4 Sacred Foundry
4 Arid Mesa
4 Wooded Foothills
4 Bloodstained Mire
4 Mountain
4 Dragon's Rage Channeler
4 Mishra's Bauble
4 Expressive Iteration
4 Steam Vents
4 Spirebluff Canal
4 Snapcaster Mage
4 Counterspell
4 Preordain
4 Serum Visions
4 Opt
4 Ragavan, Nimble Pilferer
`.trim();

const COMMANDER_POOL = `
1 Atraxa, Praetors' Voice
1 Chulane, Teller of Tales
1 Krenko, Mob Boss
1 Edgar Markov
1 Teysa Karlov
1 Rhys the Redeemed
4 Sol Ring
4 Arcane Signet
4 Command Tower
4 Cultivate
4 Kodama's Reach
4 Farseek
4 Rampant Growth
4 Swords to Plowshares
4 Path to Exile
4 Counterspell
4 Cyclonic Rift
4 Rhystic Study
4 Smothering Tithe
4 Demonic Tutor
4 Vampiric Tutor
4 Sylvan Library
4 Beast Within
4 Generous Gift
4 Chaos Warp
4 Lightning Greave
4 Swiftfoot Boots
4 Doubling Season
4 Parallel Lives
4 Craterhoof Behemoth
4 Avenger of Zendikar
4 Tireless Provisioner
4 Dockside Extortionist
4 Thrasios, Triton Hero
4 Tymna the Weaver
4 Birds of Paradise
4 Llanowar Elves
4 Elvish Mystic
4 Fellwar Stone
4 Talisman of Progress
4 Talisman of Curiosity
4 Exotic Orchard
4 Path of Ancestry
4 Reliquary Tower
4 Command Beacon
8 Forest
8 Island
8 Plains
8 Swamp
8 Mountain
`.trim();

function cardCountsAsLand(card) {
  if (!card) return false;
  const tl = (card.type_line ?? "").toLowerCase();
  const name = card.name ?? "";
  const basics = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
  return basics.includes(name.toLowerCase()) || tl.includes("land");
}

function deckMetrics(deck, resolvedByName) {
  const lookup = new Map();
  for (const r of resolvedByName) {
    if (r.card) lookup.set(r.entry.name.toLowerCase(), r.card);
  }
  let main = 0;
  let lands = 0;
  let cmcSum = 0;
  let cmcN = 0;
  const curve = new Map();
  for (const line of deck.mainboard) {
    main += line.quantity;
    const card = lookup.get(line.name.toLowerCase());
    if (cardCountsAsLand(card)) lands += line.quantity;
    else if (card) {
      const cmc = Math.max(0, card.cmc ?? 0);
      cmcSum += cmc * line.quantity;
      cmcN += line.quantity;
      const b = cmc >= 6 ? 6 : Math.floor(cmc);
      curve.set(b, (curve.get(b) ?? 0) + line.quantity);
    }
  }
  const early = [0, 1, 2].reduce((s, c) => s + (curve.get(c) ?? 0), 0);
  const top = [5, 6].reduce((s, c) => s + (curve.get(c) ?? 0), 0);
  return {
    main,
    lands,
    avgCmc: cmcN ? cmcSum / cmcN : 0,
    early,
    top,
    curve: [...curve.entries()].sort((a, b) => a[0] - b[0]),
    commander: deck.commander,
    archetype: deck.archetype,
    name: deck.name,
  };
}

async function resolve(text) {
  const res = await apiFetch(`${BASE}/api/resolve-collection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  const playable = data.resolved.filter((r) => r.card && !r.error);
  return { resolved: data.resolved, playable, summary: data.summary };
}

async function build(format, resolved, strategy, brewPrefs = {}) {
  const res = await apiFetch(`${BASE}/api/build-deck`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      format,
      resolved,
      strategy,
      ...brewPrefs,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
  return data;
}

async function runCase(label, format, text, strategy, brewPrefs) {
  console.log(`\n=== ${label} (${format}) ===`);
  const t0 = Date.now();
  const { resolved, playable, summary } = await resolve(text);
  console.log(
    `Resolved: ${playable.length} playable / ${summary?.totalLines ?? "?"} lines`,
  );
  if (playable.length < 10) {
    console.log("SKIP: not enough playable cards");
    return;
  }
  const result = await build(format, resolved, strategy, brewPrefs);
  const deck = result.deck;
  const m = deckMetrics(deck, playable);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Built in ${elapsed}s: "${deck.name}"`);
  if (deck.commander) console.log(`Commander: ${deck.commander}`);
  if (deck.archetype) console.log(`Archetype: ${deck.archetype}`);
  console.log(
    `Main: ${m.main} | Lands: ${m.lands} | Avg CMC (nonland): ${m.avgCmc.toFixed(2)} | 1-2 drops: ${m.early} | 5+: ${m.top}`,
  );
  console.log(`Curve buckets (cmc→count): ${m.curve.map(([c, n]) => `${c}:${n}`).join(" ")}`);
  if (result.adjustments?.length) {
    console.log(`Trim adjustments: ${result.adjustments.join("; ")}`);
  }
  if (deck.warnings?.length) {
    console.log(`AI warnings: ${deck.warnings.slice(0, 3).join(" | ")}`);
  }
}

const mode = process.argv[2] ?? "both";

const jobs = [];
if (mode === "modern" || mode === "both") {
  jobs.push(
    runCase(
      "Modern burn",
      "modern",
      MODERN_POOL,
      "Aggressive mono-red burn with minimal gold slots. Curve should peak at 1-2 mana.",
      { powerLevel: "focused", landsTarget: 20 },
    ),
  );
}
if (mode === "commander" || mode === "both") {
  jobs.push(
    runCase(
      "Commander value",
      "commander",
      COMMANDER_POOL,
      "Five-color value engines, +1/+1 counters and token synergies. No cEDH — casual table power.",
      { powerLevel: "focused", landsTarget: 36 },
    ),
  );
}

for (const job of jobs) await job;
console.log("\nDone.");
