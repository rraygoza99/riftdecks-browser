// Tournament coverage = decks recorded / players. riftdecks lists at most 64
// decks per event, and some events only publish their top cut, so share and
// conversion stats from low-coverage events over-represent winners.
import { tournamentKey } from '../tournamentUtils.js'

export const DEFAULT_MIN_COVERAGE = 0.5
// An event counts as "fully covered" for field-share comparisons above this.
export const FULL_COVERAGE = 0.95
export const DECK_CAP = 64

/**
 * @returns {Map<string, { key, players, decks, coverage, capped, full }>}
 *   coverage is null when the player count is unknown.
 */
export function eventCoverage(decks) {
  const map = new Map()
  for (const d of decks) {
    const key = tournamentKey(d)
    let e = map.get(key)
    if (!e) {
      e = { key, players: d.totalPlayers ?? null, decks: 0 }
      map.set(key, e)
    }
    if (e.players == null && d.totalPlayers != null) e.players = d.totalPlayers
    e.decks += 1
  }
  for (const e of map.values()) {
    e.coverage = e.players ? Math.min(1, e.decks / e.players) : null
    e.capped = e.decks >= DECK_CAP && (e.players ?? 0) > e.decks
    e.full = e.coverage != null && e.coverage >= FULL_COVERAGE
  }
  return map
}

/** Is this event below the minimum coverage? Unknown coverage is kept. */
export function isLowCoverage(entry, minCoverage) {
  if (!entry || entry.coverage == null) return false
  return entry.coverage < minCoverage
}

/** Drop decks from events below `minCoverage`. */
export function filterByCoverage(decks, minCoverage, coverage = eventCoverage(decks)) {
  if (!minCoverage) return decks
  return decks.filter((d) => !isLowCoverage(coverage.get(tournamentKey(d)), minCoverage))
}

export function formatCoverage(entry) {
  if (!entry || entry.coverage == null) return '—'
  return `${Math.round(entry.coverage * 100)}%`
}
