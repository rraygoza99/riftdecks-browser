// One definition of "which decks are in scope" shared by the deck browser and
// every analytics page, so counts agree across pages.
import { placePercent, tournamentKey } from '../tournamentUtils.js'
import { regionOf } from './regions.js'
import { eventCoverage, isLowCoverage } from '../stats/coverage.js'

export const DATE_RANGES = { '7d': 7, '30d': 30, '90d': 90, all: null }
export const DATE_LABELS = { '7d': 'last 7 days', '30d': 'last 30 days', '90d': 'last 90 days', all: 'all dates' }

/**
 * Filter decks by the shared scope. `skip` lists scope keys to ignore (e.g.
 * share stats skip `legends` so the denominator is the whole field).
 *
 * scope: { meta, dateRange, legends, maxPlacement, maxPlacePct, maxPrice,
 *          region, minCoverage }
 */
export function applyScope(decks, scope, { skip = [], now = Date.now(), coverage = null } = {}) {
  const use = (k) => !skip.includes(k)
  let out = decks

  if (use('meta') && scope.meta && scope.meta !== 'all') {
    out = out.filter((d) => d.metaSet === scope.meta)
  }
  if (use('dateRange') && scope.dateRange && scope.dateRange !== 'all') {
    const days = DATE_RANGES[scope.dateRange]
    if (days) {
      const cutoff = now - days * 86_400_000
      out = out.filter((d) => d.tournamentDate && toTime(d.tournamentDate) >= cutoff)
    }
  }
  if (use('region') && scope.region && scope.region !== 'all') {
    out = out.filter((d) => regionOf(d.tournamentCountry) === scope.region)
  }
  if (use('legends') && scope.legends?.length) {
    const set = new Set(scope.legends)
    out = out.filter((d) => set.has(d.legendName))
  }
  if (use('maxPlacement') && scope.maxPlacement > 0) {
    out = out.filter((d) => d.standing <= scope.maxPlacement)
  }
  if (use('maxPlacePct') && scope.maxPlacePct > 0) {
    out = out.filter((d) => {
      const pct = placePercent(d)
      return pct != null && pct <= scope.maxPlacePct
    })
  }
  if (use('maxPrice') && scope.maxPrice > 0) {
    out = out.filter((d) => d.price != null && d.price <= scope.maxPrice)
  }
  if (use('minCoverage') && scope.minCoverage > 0) {
    // Coverage is a property of the whole event, so compute it on the
    // unfiltered deck list (a legend filter must not change an event's coverage).
    const cov = coverage || eventCoverage(decks)
    out = out.filter((d) => !isLowCoverage(cov.get(tournamentKey(d)), scope.minCoverage))
  }
  return out
}

function toTime(date) {
  return date instanceof Date ? date.getTime() : Date.parse(date)
}

/** Short human description of the active scope for the data-source note. */
export function describeScope(scope, { skip = [] } = {}) {
  const use = (k) => !skip.includes(k)
  const parts = []
  if (use('meta')) parts.push(scope.meta && scope.meta !== 'all' ? `${scope.meta} meta` : 'all metas')
  if (use('dateRange')) parts.push(DATE_LABELS[scope.dateRange] || 'all dates')
  if (use('region') && scope.region && scope.region !== 'all') parts.push(`region ${scope.region}`)
  if (use('legends') && scope.legends?.length) parts.push(`${scope.legends.length} legend(s) selected`)
  if (use('maxPlacement') && scope.maxPlacement > 0) parts.push(`top ${scope.maxPlacement} only`)
  if (use('maxPlacePct') && scope.maxPlacePct > 0) parts.push(`top ${scope.maxPlacePct}% only`)
  if (use('maxPrice') && scope.maxPrice > 0) parts.push(`≤ $${scope.maxPrice}`)
  if (use('minCoverage') && scope.minCoverage > 0) {
    parts.push(`events ≥ ${Math.round(scope.minCoverage * 100)}% coverage`)
  }
  return parts.join(' · ')
}

/**
 * The newest set in the data: the metaSet whose first tournament is the most
 * recent (so a new set wins as soon as its first events appear, even while
 * the previous set still has more decks). Null when no deck carries a set.
 */
export function latestMetaSet(decks) {
  const first = new Map()
  for (const d of decks) {
    if (!d.metaSet || !d.tournamentDate) continue
    const t = toTime(d.tournamentDate)
    if (Number.isNaN(t)) continue
    if (!first.has(d.metaSet) || t < first.get(d.metaSet)) first.set(d.metaSet, t)
  }
  let best = null
  for (const [set, t] of first) if (!best || t > best[1]) best = [set, t]
  return best ? best[0] : null
}

/** Count distinct tournaments in a deck list. */
export function countEvents(decks) {
  return new Set(decks.map((d) => tournamentKey(d))).size
}
