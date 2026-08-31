// Monte Carlo "goldfish" simulation core for Riftbound deck consistency.
//
// Pure and serialisable so it can run single-threaded (tests / browser) or be
// sharded across worker threads. The engine draws opening hands, applies a
// mulligan heuristic, walks turns 1..T generating a resource pool each turn,
// and greedily spends energy to measure how consistently a deck "curves out".
//
// Card model: { name, cost, type: 'unit'|'spell'|'gear', tags: string[], count }
// The simulation only shuffles/draws the 40-card main deck; the rune deck is
// abstracted into the per-turn resource pool.

// Deterministic PRNG so runs are reproducible across threads (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Flatten a deck definition's per-card counts into individual card instances.
export function expandDeck(cards) {
  const out = []
  for (const c of cards) {
    const card = {
      name: c.name,
      cost: Number.isFinite(c.cost) ? c.cost : 0,
      type: c.type || 'unit',
      tags: c.tags || [],
    }
    for (let i = 0; i < (c.count ?? c.quantity ?? 1); i++) out.push(card)
  }
  return out
}

// In-place Fisher-Yates using the supplied rng.
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// 0/1 knapsack: pick a subset of `costs` maximising total spend <= budget.
// budget stays tiny (<= turns) so the DP is effectively O(cards * budget).
export function bestSpend(costs, budget) {
  const reachable = new Array(budget + 1).fill(null)
  reachable[0] = []
  for (let i = 0; i < costs.length; i++) {
    const c = costs[i]
    if (c > budget) continue
    for (let s = budget; s >= c; s--) {
      if (reachable[s - c] && !reachable[s]) reachable[s] = [...reachable[s - c], i]
    }
  }
  for (let s = budget; s >= 0; s--) {
    if (reachable[s]) return { spent: s, indices: reachable[s] }
  }
  return { spent: 0, indices: [] }
}

const DEFAULT_CONFIG = {
  handSize: 4,
  turns: 4,
  powerPerTurn: 2, // two runes channeled per turn: pool on turn t = t * powerPerTurn
  maxMulligans: 1,
  mulligan: { minEarlyCards: 1, earlyCostMin: 1, earlyCostMax: 2 },
  thresholds: [
    { name: 'units_by_t3', turn: 3, type: 'unit', count: 3 },
    { name: 'units_by_t4', turn: 4, type: 'unit', count: 4 },
  ],
}

export function resolveConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    mulligan: { ...DEFAULT_CONFIG.mulligan, ...(config.mulligan || {}) },
    thresholds: config.thresholds || DEFAULT_CONFIG.thresholds,
  }
}

// Would we keep this opening hand? Heuristic: keep only if it has at least
// `minEarlyCards` cheap (cost within [earlyCostMin, earlyCostMax]) plays.
function handIsKeepable(hand, mull) {
  const early = hand.filter((c) => c.cost >= mull.earlyCostMin && c.cost <= mull.earlyCostMax)
  return early.length >= mull.minEarlyCards
}

/**
 * Simulate one game and return its raw per-turn record.
 */
export function simulateGame(deckCards, config, rng) {
  const cfg = config
  const deck = shuffle(deckCards.slice(), rng)
  let idx = 0
  const draw = (k) => deck.slice(idx, (idx += k))

  // Opening hand + mulligan (full redraw, Vancouver-style).
  let hand = draw(cfg.handSize)
  let mulligans = 0
  while (!handIsKeepable(hand, cfg.mulligan) && mulligans < cfg.maxMulligans) {
    shuffle(deck, rng)
    idx = 0
    hand = draw(cfg.handSize)
    mulligans++
  }

  const T = cfg.turns
  const spent = new Array(T).fill(0)
  const available = new Array(T).fill(0)
  const cardsPlayed = new Array(T).fill(0)
  const playedTypesByTurn = Array.from({ length: T }, () => [])

  for (let t = 1; t <= T; t++) {
    if (t > 1 && idx < deck.length) hand.push(...draw(1))
    const pool = t * cfg.powerPerTurn
    available[t - 1] = pool

    const { spent: used, indices } = bestSpend(
      hand.map((c) => c.cost),
      pool,
    )
    spent[t - 1] = used
    cardsPlayed[t - 1] = indices.length

    // Remove played cards (descending index) and log their types.
    const chosen = new Set(indices)
    const remaining = []
    hand.forEach((c, i) => {
      if (chosen.has(i)) playedTypesByTurn[t - 1].push(c.type)
      else remaining.push(c)
    })
    hand = remaining
  }

  return { spent, available, cardsPlayed, playedTypesByTurn, mulligans }
}

// A zeroed aggregate matching the configured turn count.
export function emptyAggregate(config) {
  const T = config.turns
  const thresholdMet = {}
  for (const th of config.thresholds) thresholdMet[th.name] = 0
  return {
    n: 0,
    brick: 0,
    whiff: new Array(T).fill(0),
    spentSum: new Array(T).fill(0),
    availSum: new Array(T).fill(0),
    floatSum: new Array(T).fill(0),
    cardsPlayedSum: new Array(T).fill(0),
    mulliganSum: 0,
    thresholdMet,
    turns: T,
    thresholdNames: config.thresholds.map((t) => t.name),
  }
}

// Fold one game's record into an aggregate.
export function accumulate(agg, game, config) {
  const T = config.turns
  agg.n += 1
  agg.mulliganSum += game.mulligans

  for (let t = 0; t < T; t++) {
    agg.spentSum[t] += game.spent[t]
    agg.availSum[t] += game.available[t]
    agg.floatSum[t] += game.available[t] - game.spent[t]
    agg.cardsPlayedSum[t] += game.cardsPlayed[t]
    if (game.cardsPlayed[t] === 0) agg.whiff[t] += 1
  }

  // Brick: no action across the first two turns.
  if ((game.cardsPlayed[0] || 0) === 0 && (game.cardsPlayed[1] || 0) === 0) agg.brick += 1

  // Thresholds: cumulative count of a card type through a given turn.
  for (const th of config.thresholds) {
    let count = 0
    for (let t = 0; t < th.turn && t < T; t++) {
      for (const type of game.playedTypesByTurn[t]) {
        if (th.type === '*' || type === th.type) count += 1
      }
    }
    if (count >= th.count) agg.thresholdMet[th.name] += 1
  }
}

// Combine partial aggregates from multiple workers.
export function mergeAggregates(aggs) {
  const base = aggs[0]
  const T = base.turns
  const merged = {
    n: 0,
    brick: 0,
    whiff: new Array(T).fill(0),
    spentSum: new Array(T).fill(0),
    availSum: new Array(T).fill(0),
    floatSum: new Array(T).fill(0),
    cardsPlayedSum: new Array(T).fill(0),
    mulliganSum: 0,
    thresholdMet: {},
    turns: T,
    thresholdNames: base.thresholdNames,
  }
  for (const name of base.thresholdNames) merged.thresholdMet[name] = 0
  for (const a of aggs) {
    merged.n += a.n
    merged.brick += a.brick
    merged.mulliganSum += a.mulliganSum
    for (let t = 0; t < T; t++) {
      merged.whiff[t] += a.whiff[t]
      merged.spentSum[t] += a.spentSum[t]
      merged.availSum[t] += a.availSum[t]
      merged.floatSum[t] += a.floatSum[t]
      merged.cardsPlayedSum[t] += a.cardsPlayedSum[t]
    }
    for (const name of base.thresholdNames) merged.thresholdMet[name] += a.thresholdMet[name]
  }
  return merged
}

// Run `count` games over one deck definition and return the raw aggregate.
export function runChunk(deckDef, config, count, seed) {
  const cfg = resolveConfig(config)
  const deckCards = expandDeck(deckDef.cards)
  const rng = mulberry32(seed)
  const agg = emptyAggregate(cfg)
  for (let i = 0; i < count; i++) {
    const game = simulateGame(deckCards, cfg, rng)
    accumulate(agg, game, cfg)
  }
  return agg
}

const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 10000) / 100 : 0)
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d

// Turn a raw aggregate into a human-readable JSON report.
export function finalizeReport(agg, { deckMeta = {}, config, runtimeMs = null, threadsUsed = 1 } = {}) {
  const cfg = resolveConfig(config)
  const T = agg.turns
  const totalSpent = agg.spentSum.reduce((a, b) => a + b, 0)
  const totalAvail = agg.availSum.reduce((a, b) => a + b, 0)

  const byTurn = (arr, asPct = false) => {
    const o = {}
    for (let t = 0; t < T; t++) o[t + 1] = asPct ? pct(arr[t], agg.n) : round(arr[t] / agg.n)
    return o
  }

  const curveEfficiencyByTurn = {}
  for (let t = 0; t < T; t++) curveEfficiencyByTurn[t + 1] = pct(agg.spentSum[t], agg.availSum[t])

  const turnWhiffRate = {}
  for (let t = 0; t < T; t++) turnWhiffRate[t + 1] = pct(agg.whiff[t], agg.n)

  const thresholds = {}
  for (const th of cfg.thresholds) {
    thresholds[th.name] = {
      description: `>= ${th.count} ${th.type} played by turn ${th.turn}`,
      probability: pct(agg.thresholdMet[th.name], agg.n),
    }
  }

  return {
    deck: deckMeta,
    config: {
      iterations: agg.n,
      handSize: cfg.handSize,
      turns: cfg.turns,
      powerPerTurn: cfg.powerPerTurn,
      maxMulligans: cfg.maxMulligans,
      mulligan: cfg.mulligan,
    },
    metrics: {
      brickRate: pct(agg.brick, agg.n),
      curveEfficiency: pct(totalSpent, totalAvail),
      curveEfficiencyByTurn,
      turnWhiffRate,
      avgCardsPlayedByTurn: byTurn(agg.cardsPlayedSum),
      avgFloatByTurn: byTurn(agg.floatSum),
      avgMulligans: round(agg.mulliganSum / agg.n),
      thresholds,
    },
    performance: { runtimeMs, threadsUsed },
  }
}

/**
 * Single-threaded convenience: run the full simulation and return the report.
 */
export function runSimulation(deckDef, config = {}, { seed = 0x1234 } = {}) {
  const cfg = resolveConfig(config)
  const iterations = cfg.iterations ?? config.iterations ?? 10000
  const start = Date.now()
  const agg = runChunk(deckDef, cfg, iterations, seed)
  return finalizeReport(agg, {
    deckMeta: deckDef.meta || {},
    config: cfg,
    runtimeMs: Date.now() - start,
    threadsUsed: 1,
  })
}
