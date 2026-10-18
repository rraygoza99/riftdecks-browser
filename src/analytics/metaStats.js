// Placement-based legend statistics shared by Meta, Conversion, Trends and
// region views. Pure: input is a list of scoped decks.
import { tournamentKey } from '../tournamentUtils.js'
import { regionOf, REGIONS } from '../data/regions.js'
import { eventCoverage } from '../stats/coverage.js'
import { wilsonInterval, eventWeight, linearFit, twoProportionTest, estimateBetaPrior, shrinkRate } from '../stats/stats.js'

/**
 * Per-legend counts: decks, firsts, top-4, top-8, plus Wilson intervals.
 * @returns rows sorted by deck count desc.
 */
export function legendCounts(decks) {
  const map = new Map()
  for (const d of decks) {
    const name = d.legendName || 'Unknown'
    let e = map.get(name)
    if (!e) map.set(name, (e = { name, decks: 0, firsts: 0, top4: 0, top8: 0 }))
    e.decks += 1
    if (d.standing === 1) e.firsts += 1
    if (d.standing <= 4) e.top4 += 1
    if (d.standing <= 8) e.top8 += 1
  }
  const total = decks.length || 1
  return [...map.values()]
    .map((e) => ({
      ...e,
      share: e.decks / total,
      firstCI: wilsonInterval(e.firsts, e.decks),
      top8CI: wilsonInterval(e.top8, e.decks),
    }))
    .sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name))
}

/**
 * Rank legends by a rate using the Wilson lower bound. Rows below `minN`
 * are kept (so they can be shown faded) but always sort after ranked rows.
 * @param {'firsts'|'top8'|'top4'} field
 */
export function rankByRate(rows, field, { minN = 10, method = 'wilson' } = {}) {
  // Shrinkage prior is estimated from the eligible legends (empirical Bayes).
  const prior = estimateBetaPrior(rows.filter((r) => r.decks >= minN).map((r) => ({ k: r[field], n: r.decks })))
  return rows
    .map((r) => {
      const ci = wilsonInterval(r[field], r.decks)
      const score = method === 'shrink' ? shrinkRate(r[field], r.decks, prior.mean, prior.strength) : ci.low
      return { ...r, k: r[field], n: r.decks, rate: ci.p, low: ci.low, high: ci.high, score, eligible: r.decks >= minN }
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || b.n - a.n)
}

/**
 * Event-size-weighted performance per legend. Each deck's top-8 finish is
 * weighted by log2(players) so a top-8 at a 500-player event counts ~2x a
 * top-8 at a 20-player event.
 */
export function weightedPerformance(decks) {
  const map = new Map()
  for (const d of decks) {
    const name = d.legendName || 'Unknown'
    const w = eventWeight(d.totalPlayers)
    let e = map.get(name)
    if (!e) map.set(name, (e = { name, n: 0, top8: 0, wSum: 0, wTop8: 0, w2Sum: 0 }))
    e.n += 1
    e.wSum += w
    e.w2Sum += w * w
    if (d.standing <= 8) {
      e.top8 += 1
      e.wTop8 += w
    }
  }
  return [...map.values()].map((e) => {
    const rate = e.wSum ? e.wTop8 / e.wSum : 0
    // Kish effective sample size for the weighted rate.
    const nEff = e.w2Sum ? (e.wSum * e.wSum) / e.w2Sum : 0
    const ci = wilsonInterval(rate * nEff, nEff)
    return { name: e.name, n: e.n, top8: e.top8, rawRate: e.n ? e.top8 / e.n : 0, weightedRate: rate, nEff, low: ci.low, high: ci.high }
  })
}

/**
 * Over/under-performance on fully covered events only: a legend's share of
 * top-cut (top 8) slots divided by its share of the field. 1 = performs as
 * often as it is played; >1 over-performs.
 */
export function topCutRatio(decks, { topCut = 8, coverage = eventCoverage(decks) } = {}) {
  const full = decks.filter((d) => coverage.get(tournamentKey(d))?.full && !coverage.get(tournamentKey(d))?.capped)
  const events = new Set(full.map((d) => tournamentKey(d)))
  const cut = full.filter((d) => d.standing <= topCut)
  const field = new Map()
  const inCut = new Map()
  for (const d of full) field.set(d.legendName, (field.get(d.legendName) || 0) + 1)
  for (const d of cut) inCut.set(d.legendName, (inCut.get(d.legendName) || 0) + 1)
  const rows = [...field.entries()].map(([name, f]) => {
    const c = inCut.get(name) || 0
    const fieldShare = f / full.length
    const cutShare = cut.length ? c / cut.length : 0
    // Same comparison as a test of top-8 rate vs everyone else's top-8 rate.
    const t = twoProportionTest(c, f, cut.length - c, full.length - f)
    return { name, fieldDecks: f, cutDecks: c, fieldShare, cutShare, ratio: fieldShare ? cutShare / fieldShare : 0, p: t.p }
  })
  return { events: events.size, decks: full.length, cutSlots: cut.length, rows: rows.sort((a, b) => b.fieldDecks - a.fieldDecks) }
}

/** Meta share and top-8 conversion per legend for each region. */
export function regionSplit(decks) {
  const byRegion = new Map(REGIONS.map((r) => [r, []]))
  for (const d of decks) byRegion.get(regionOf(d.tournamentCountry)).push(d)
  const out = {}
  for (const [region, list] of byRegion) {
    out[region] = { decks: list.length, events: new Set(list.map((d) => tournamentKey(d))).size, legends: new Map(legendCounts(list).map((r) => [r.name, r])) }
  }
  return out
}

// ISO week start (Monday, UTC) for a date.
export function weekStart(date) {
  const d = new Date(date instanceof Date ? date.getTime() : Date.parse(date))
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - day)
  return d.toISOString().slice(0, 10)
}

/**
 * Weekly share per legend.
 * @returns {{ weeks: string[], totals: number[], series: Map<name, {k:number[], share:number[]}> }}
 */
export function weeklyShares(decks) {
  const weeks = [...new Set(decks.filter((d) => d.tournamentDate).map((d) => weekStart(d.tournamentDate)))].sort()
  const wi = new Map(weeks.map((w, i) => [w, i]))
  const totals = new Array(weeks.length).fill(0)
  const series = new Map()
  for (const d of decks) {
    if (!d.tournamentDate) continue
    const i = wi.get(weekStart(d.tournamentDate))
    totals[i] += 1
    const name = d.legendName || 'Unknown'
    if (!series.has(name)) series.set(name, { k: new Array(weeks.length).fill(0) })
    series.get(name).k[i] += 1
  }
  for (const s of series.values()) s.share = s.k.map((k, i) => (totals[i] ? k / totals[i] : 0))
  return { weeks, totals, series }
}

/**
 * Momentum: weighted least-squares slope of weekly share (per week) plus a
 * recent-vs-earlier two-proportion test. "rising"/"falling" only when the
 * test is significant at alpha; otherwise "steady".
 */
export function momentum(weekly, name, { recentWeeks = 2, alpha = 0.05 } = {}) {
  const s = weekly.series.get(name)
  if (!s || weekly.weeks.length < 3) return { slope: 0, label: 'steady', p: 1, recent: null, earlier: null }
  const pts = s.share.map((y, x) => ({ x, y })).filter((_, i) => weekly.totals[i] > 0)
  const { slope } = linearFit(pts)
  const n = weekly.weeks.length
  const cut = Math.max(1, n - recentWeeks)
  const sum = (arr, a, b) => arr.slice(a, b).reduce((t, v) => t + v, 0)
  const kR = sum(s.k, cut, n)
  const nR = sum(weekly.totals, cut, n)
  const kE = sum(s.k, 0, cut)
  const nE = sum(weekly.totals, 0, cut)
  const t = twoProportionTest(kR, nR, kE, nE)
  const label = t.p < alpha ? (t.diff > 0 ? 'rising' : 'falling') : 'steady'
  return { slope, label, p: t.p, recent: { k: kR, n: nR }, earlier: { k: kE, n: nE } }
}
