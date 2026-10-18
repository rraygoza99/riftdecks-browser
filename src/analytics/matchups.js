// Matchup model over the riftDecks head-to-head matrix.
//
//  - Each matchup winrate is shrunk toward 50% with a prior worth
//    `priorStrength` matches: p = (wins + 0.5·m) / (n + m). Low-n matchups
//    therefore sit near a coin flip instead of at a noisy extreme.
//  - Expected winrate vs a field = Σ share_j · p_ij (mirror = 50%), with
//    variance Σ share_j² · p_ij(1-p_ij)/(n_ij + m) (independent matchups).
//  - The Swiss simulator uses the same shrunk p_ij as each match's win
//    probability. Assumptions: no player skill, no draws (the matrix carries
//    no draw data), random pairing within score groups, random tiebreaks.
import { Z95, seededRng } from '../stats/stats.js'

export const DEFAULT_PRIOR_MATCHES = 20

/** Shrunk win probability of a vs b. */
export function matchup(matrix, a, b, { priorStrength = DEFAULT_PRIOR_MATCHES } = {}) {
  if (a === b) return { p: 0.5, n: 0, raw: null, variance: 0, mirror: true }
  let wins = 0
  let n = 0
  const cell = matrix[a]?.[b]
  const rev = matrix[b]?.[a]
  if (cell && cell.matches > 0) {
    n = cell.matches
    wins = (cell.winrate / 100) * n
  } else if (rev && rev.matches > 0) {
    n = rev.matches
    wins = (1 - rev.winrate / 100) * n
  }
  const m = priorStrength
  const p = (wins + 0.5 * m) / (n + m)
  return { p, n, raw: n ? wins / n : null, variance: (p * (1 - p)) / (n + m), mirror: false }
}

/** Normalise a {legend: weight} map/object into a Map of shares summing to 1. */
export function normalizeField(field) {
  const entries = field instanceof Map ? [...field.entries()] : Object.entries(field)
  const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0)
  return new Map(total ? entries.filter(([, w]) => w > 0).map(([k, w]) => [k, w / total]) : [])
}

/** Global field from the matrix: each legend's share of match seats. */
export function fieldFromMatrix(winrateData) {
  return normalizeField(Object.fromEntries((winrateData.legends || []).map((l) => [l.name, l.matches])))
}

/**
 * Field from tournament decks (e.g. one region), restricted to legends the
 * matrix knows; everything else is dropped and reported as `unmatchedShare`.
 */
export function fieldFromDecks(decks, knownLegends) {
  const known = new Set(knownLegends)
  const counts = new Map()
  let unmatched = 0
  for (const d of decks) {
    if (known.has(d.legendName)) counts.set(d.legendName, (counts.get(d.legendName) || 0) + 1)
    else unmatched += 1
  }
  return { field: normalizeField(counts), unmatchedShare: decks.length ? unmatched / decks.length : 0, decks: decks.length }
}

/**
 * Expected winrate of each legend vs a field, with a 95% band.
 * @returns [{ legend, ewr, sd, low, high, coveredShare }] sorted by ewr desc.
 *   coveredShare = share of the field with at least one real match recorded.
 */
export function expectedVsField(matrix, legends, field, { priorStrength = DEFAULT_PRIOR_MATCHES } = {}) {
  const shares = normalizeField(field)
  return legends
    .map((legend) => {
      let ewr = 0
      let variance = 0
      let covered = 0
      for (const [opp, s] of shares) {
        const mu = matchup(matrix, legend, opp, { priorStrength })
        ewr += s * mu.p
        variance += s * s * mu.variance
        if (mu.mirror || mu.n > 0) covered += s
      }
      const sd = Math.sqrt(variance)
      return { legend, ewr, sd, low: Math.max(0, ewr - Z95 * sd), high: Math.min(1, ewr + Z95 * sd), coveredShare: covered }
    })
    .sort((a, b) => b.ewr - a.ewr)
}

/** Build a fast lookup of shrunk p for all pairs of `legends`. */
export function probabilityTable(matrix, legends, opts) {
  const idx = new Map(legends.map((l, i) => [l, i]))
  const P = legends.map((a) => legends.map((b) => matchup(matrix, a, b, opts).p))
  return { idx, P }
}

/**
 * Monte Carlo Swiss tournament.
 * @param {object} cfg
 * @param {Map}    cfg.field     legend -> share (opponents are sampled from it)
 * @param {string} cfg.chosen    legend piloted by the tracked player (player 0)
 * @param {number} cfg.players   total players including the tracked one
 * @param {number} cfg.rounds    Swiss rounds
 * @param {number} cfg.topCut    single-elimination cut size (0 = Swiss winner)
 * @param {number} cfg.sims      tournaments to simulate
 * @param {{idx, P}} cfg.table   from probabilityTable (must include all field legends + chosen)
 * @returns {{ chosen: { topCut, wins, sims }, byLegend: Map<legend, { entries, topCut, wins }> }}
 */
export function simulateSwiss({ field, chosen, players, rounds, topCut, sims, table, seed = 11 }) {
  const rng = seededRng(seed)
  const legends = [...field.keys()]
  const cum = []
  let acc = 0
  for (const l of legends) {
    acc += field.get(l)
    cum.push(acc)
  }
  const sample = () => {
    const r = rng() * acc
    let lo = 0
    while (lo < cum.length - 1 && cum[lo] < r) lo++
    return legends[lo]
  }
  const { idx, P } = table
  const win = (a, b) => rng() < P[idx.get(a)][idx.get(b)]
  const byLegend = new Map()
  const stat = (l) => {
    if (!byLegend.has(l)) byLegend.set(l, { entries: 0, topCut: 0, wins: 0 })
    return byLegend.get(l)
  }
  const chosenStat = { topCut: 0, wins: 0, sims }
  const cut = Math.min(topCut, players)

  for (let s = 0; s < sims; s++) {
    const seat = Array.from({ length: players }, (_, i) => ({ id: i, legend: i === 0 ? chosen : sample(), pts: 0, tie: rng(), opp: new Set(), bye: false }))
    for (let r = 0; r < rounds; r++) {
      const order = [...seat].sort((a, b) => b.pts - a.pts || a.tie - b.tie || rng() - 0.5)
      // Bye to the lowest-ranked player without one.
      if (order.length % 2) {
        let bi = order.length - 1
        while (bi > 0 && order[bi].bye) bi--
        const [byePlayer] = order.splice(bi, 1)
        byePlayer.bye = true
        byePlayer.pts += 3
      }
      const pool = order
      while (pool.length) {
        const a = pool.shift()
        // Avoid rematches when possible.
        let j = pool.findIndex((p) => !a.opp.has(p.id))
        if (j < 0) j = 0
        const [b] = pool.splice(j, 1)
        a.opp.add(b.id)
        b.opp.add(a.id)
        if (win(a.legend, b.legend)) a.pts += 3
        else b.pts += 3
      }
    }
    const standings = [...seat].sort((a, b) => b.pts - a.pts || a.tie - b.tie)
    let champion
    if (cut >= 2) {
      let bracket = standings.slice(0, cut)
      for (const p of bracket) {
        stat(p.legend).topCut += 1
        if (p.id === 0) chosenStat.topCut += 1
      }
      // Seeded single elimination: 1 v n, 2 v n-1, … (non-power-of-2 cuts
      // give the top seeds byes).
      while (bracket.length > 1) {
        const next = []
        let size = 1
        while (size * 2 <= bracket.length) size *= 2
        const byes = bracket.length === size ? 0 : size * 2 - bracket.length
        next.push(...bracket.slice(0, byes))
        const playing = bracket.slice(byes)
        for (let i = 0; i < playing.length / 2; i++) {
          const a = playing[i]
          const b = playing[playing.length - 1 - i]
          next.push(win(a.legend, b.legend) ? a : b)
        }
        bracket = next.sort((a, b) => standings.indexOf(a) - standings.indexOf(b))
      }
      champion = bracket[0]
    } else {
      champion = standings[0]
      stat(champion.legend).topCut += 1
      if (champion.id === 0) chosenStat.topCut += 1
    }
    stat(champion.legend).wins += 1
    if (champion.id === 0) chosenStat.wins += 1
    for (const p of seat) if (p.id !== 0) stat(p.legend).entries += 1
  }
  // Field-player stats only count sampled opponents (entries); fold their
  // top-cut/wins to exclude the tracked player.
  return { chosen: chosenStat, byLegend: subtractChosen(byLegend, chosen, chosenStat) }
}

function subtractChosen(byLegend, chosen, chosenStat) {
  const s = byLegend.get(chosen)
  if (s) {
    s.topCut -= chosenStat.topCut
    s.wins -= chosenStat.wins
  }
  return byLegend
}
