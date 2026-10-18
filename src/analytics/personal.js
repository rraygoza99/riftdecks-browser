// Personal match log (My Decks, localStorage) vs the global head-to-head
// matrix: "3-7 vs Rengar; field average 46%".
import { matchup, DEFAULT_PRIOR_MATCHES } from './matchups.js'
import { binomialTestP } from '../stats/stats.js'

/**
 * Resolve a free-text legend name to a matrix legend: exact, then
 * case-insensitive full name, then unique match on the champion part
 * ("Rengar" -> "Rengar, Pridestalker").
 */
export function resolveLegend(name, known) {
  const q = (name || '').trim().toLowerCase()
  if (!q) return null
  const exact = known.find((k) => k.toLowerCase() === q)
  if (exact) return exact
  const byShort = known.filter((k) => k.split(',')[0].trim().toLowerCase() === q.split(',')[0].trim())
  return byShort.length === 1 ? byShort[0] : null
}

/**
 * @param {string} myLegend    the tracked deck's legend (free text)
 * @param {Array}  matches     [{ opponent, result: 'win'|'loss'|'draw' }]
 * @param {object} matrix      winrate matrix cells
 * @param {string[]} known     matrix legend names
 * @returns {{ legend, rows: [...] }} rows sorted by gap significance; each row:
 *   { opponent, resolved, win, loss, draw, decisive, personal, global, globalN, gap, p, flagged }
 */
export function compareToGlobal(myLegend, matches, matrix, known, { priorStrength = DEFAULT_PRIOR_MATCHES, minGames = 3, alpha = 0.1 } = {}) {
  const legend = resolveLegend(myLegend, known)
  const groups = new Map()
  for (const m of matches) {
    const key = m.opponent?.trim() || 'Unknown'
    if (!groups.has(key)) groups.set(key, { opponent: key, win: 0, loss: 0, draw: 0 })
    const g = groups.get(key)
    if (g[m.result] != null) g[m.result] += 1
  }
  const rows = [...groups.values()].map((g) => {
    const resolved = resolveLegend(g.opponent, known)
    const decisive = g.win + g.loss
    const personal = decisive ? g.win / decisive : null
    const mu = legend && resolved ? matchup(matrix, legend, resolved, { priorStrength }) : null
    const global = mu ? mu.p : null
    const p = global != null && decisive ? binomialTestP(g.win, decisive, global) : 1
    return {
      ...g,
      resolved,
      decisive,
      personal,
      global,
      globalN: mu?.n ?? 0,
      gap: personal != null && global != null ? personal - global : null,
      p,
      flagged: decisive >= minGames && p < alpha,
    }
  })
  rows.sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.p - b.p || Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
  return { legend, rows }
}
