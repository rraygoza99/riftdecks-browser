// Does goldfish consistency predict tournament results? Correlates per-deck
// simulator metrics with placement. Pure, so it can be unit tested and run
// from the Consistency page after a batch simulation.
import { pearson, spearman, correlationPValue, mean } from '../stats/stats.js'
import { placePercent } from '../tournamentUtils.js'

const meanOrNull = (v) => (v.length ? mean(v) : null)

export const CONSISTENCY_METRICS = [
  { key: 'brickRate', label: 'Brick rate (no T1/T2 play)', better: 'lower' },
  { key: 'curveEfficiency', label: 'Curve efficiency', better: 'higher' },
  { key: 'unitsByT3', label: 'P(units on curve by T3)', better: 'higher' },
]

/** Pull the compared metrics out of a goldfish report. */
export function metricsFromReport(report) {
  const m = report.metrics
  return {
    brickRate: m.brickRate,
    curveEfficiency: m.curveEfficiency,
    unitsByT3: m.thresholds?.units_by_t3?.probability ?? null,
  }
}

/**
 * @param {Array<{ deck, metrics }>} rows
 * @returns {{ n, results: [{ key, label, top8: {r,p,meanTop,meanRest}, percentile: {rho,p} , meaningful }] }}
 *   top8 r is point-biserial (metric vs top-8 = 1); percentile rho is
 *   Spearman vs placement percentile (lower = better, so a "good" metric
 *   correlates negatively).
 */
export function correlateConsistency(rows, { alpha = 0.05 } = {}) {
  const usable = rows.filter((r) => r.metrics)
  const results = CONSISTENCY_METRICS.map(({ key, label, better }) => {
    const pts = usable.filter((r) => r.metrics[key] != null)
    const xs = pts.map((r) => r.metrics[key])
    const top = pts.map((r) => (r.deck.standing <= 8 ? 1 : 0))
    const withPct = pts.filter((r) => placePercent(r.deck) != null)
    const r8 = pearson(xs, top)
    const rho = spearman(withPct.map((r) => r.metrics[key]), withPct.map((r) => placePercent(r.deck)))
    const p8 = correlationPValue(r8, pts.length)
    const pRho = correlationPValue(rho, withPct.length)
    return {
      key,
      label,
      better,
      n: pts.length,
      top8: {
        r: r8,
        p: p8,
        nTop: top.filter(Boolean).length,
        nRest: top.length - top.filter(Boolean).length,
        meanTop: meanOrNull(pts.filter((r) => r.deck.standing <= 8).map((r) => r.metrics[key])),
        meanRest: meanOrNull(pts.filter((r) => r.deck.standing > 8).map((r) => r.metrics[key])),
      },
      percentile: { rho, p: pRho, n: withPct.length },
      meaningful: (r8 != null && p8 < alpha) || (rho != null && pRho < alpha),
    }
  })
  const nTop = usable.filter((r) => r.deck.standing <= 8).length
  return { n: usable.length, nTop, nRest: usable.length - nTop, results, anyMeaningful: results.some((r) => r.meaningful) }
}
