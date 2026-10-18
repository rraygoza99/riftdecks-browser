import { useMemo, useRef, useState } from 'react'
import DataSourceNote from './DataSourceNote'
import { applyScope, describeScope } from '../data/scope'
import { entriesFor, listToDeckDef } from '../analytics/cardAnalysis'
import { correlateConsistency, metricsFromReport } from '../analytics/consistencyResults'
import { runSimulation } from '../simulation/goldfish'
import './Analytics.css'

const ITERATION_OPTIONS = [500, 1000, 2000, 5000]
// Skip decks where too many main-deck cards lack a known energy cost — their
// simulated curve would mostly reflect the fallback, not the real list.
const MAX_UNKNOWN_SHARE = 0.1

const fmtR = (v) => (v == null ? '—' : v.toFixed(2))
const fmtP = (p) => (p < 0.001 ? '<0.001' : p.toFixed(3))

/**
 * Batch-run the goldfish simulator over every in-scope deck with a card list
 * and test whether its consistency metrics correlate with placement.
 */
export default function ConsistencyVsResults({ allDecks, scope, coverage, deckCards, config }) {
  const [iterations, setIterations] = useState(1000)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const cancelRef = useRef(false)
  const info = deckCards?.data?.info
  const lists = deckCards?.data?.lists

  const candidates = useMemo(() => {
    if (!lists || !scope) return { usable: [], skipped: 0, total: 0 }
    const scoped = applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage })
    const entries = entriesFor(scoped, lists)
    const usable = []
    let skipped = 0
    for (const e of entries) {
      const def = listToDeckDef(e.list, info)
      const total = def.cards.reduce((s, c) => s + c.count, 0)
      const unknown = def.cards.filter((c) => c.cost == null).reduce((s, c) => s + c.count, 0)
      if (total < 30 || unknown / total > MAX_UNKNOWN_SHARE) {
        skipped += 1
        continue
      }
      // Unknown costs (≤10% of the deck) are treated as 3-drops.
      def.cards = def.cards.map((c) => (c.cost == null ? { ...c, cost: 3 } : c))
      usable.push({ deck: e.deck, def })
    }
    return { usable, skipped, total: entries.length }
  }, [allDecks, scope, coverage, lists, info])

  const run = () => {
    cancelRef.current = false
    const rows = []
    const items = candidates.usable
    let i = 0
    setResult(null)
    setProgress({ done: 0, total: items.length })
    // Simulate in small batches so the page stays responsive.
    const step = () => {
      if (cancelRef.current) {
        setProgress(null)
        return
      }
      const end = Math.min(items.length, i + 5)
      for (; i < end; i++) {
        const report = runSimulation(items[i].def, { ...config, iterations }, { seed: 1000 + i })
        rows.push({ deck: items[i].deck, metrics: metricsFromReport(report) })
      }
      setProgress({ done: i, total: items.length })
      if (i < items.length) setTimeout(step, 0)
      else {
        setResult(correlateConsistency(rows))
        setProgress(null)
      }
    }
    setTimeout(step, 20)
  }

  return (
    <section className="an-card" style={{ marginTop: 20 }}>
      <h2>Consistency vs results</h2>
      <p className="an-sub">
        Runs the simulator above (current turn/hand/mulligan settings) over every in-scope tournament deck with a
        card list, then checks whether brick rate, curve efficiency and units-on-curve correlate with finishing top 8
        (point-biserial r) or with placement percentile (Spearman ρ; lower percentile = better finish, so a helpful
        metric shows negative ρ for curve efficiency and positive ρ for brick rate).
      </p>
      {scope && (
        <DataSourceNote
          dataset="cards"
          filters={describeScope(scope, { skip: ['maxPrice', 'maxPlacePct', 'maxPlacement', 'legends'] })}
          counts={`${candidates.usable.length} decks simulated-ready of ${candidates.total} with card lists (${candidates.skipped} skipped: >10% of cards without a known energy cost)`}
        />
      )}
      <div className="an-row" style={{ marginBottom: 12 }}>
        <label className="filter-group">
          <span className="filter-label">Games per deck</span>
          <select className="filter-select" value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>
            {ITERATION_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {progress ? (
          <>
            <span className="an-small">
              Simulating {progress.done}/{progress.total}…
            </span>
            <button type="button" className="an-btn an-btn--ghost" onClick={() => (cancelRef.current = true)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="an-btn" disabled={!candidates.usable.length} onClick={run}>
            Run on {candidates.usable.length} decks
          </button>
        )}
      </div>

      {deckCards?.loading && <div className="an-empty">Loading card lists…</div>}
      {result && (
        <>
          <p className={result.anyMeaningful ? 'an-up' : 'an-muted'} style={{ margin: '0 0 10px' }}>
            {result.anyMeaningful
              ? `At least one metric correlates with results at p < 0.05 across ${result.n} decks — see below. With this many comparisons, treat a single borderline p-value with caution.`
              : `No meaningful correlation: none of the consistency metrics predict top-8 finishes or placement percentile at p < 0.05 across ${result.n} decks. Tournament results here are driven by other factors (matchups, play skill, variance) more than by goldfish curve consistency${result.n < 100 ? ', and the sample is small' : ''}.`}
          </p>
          {(!result.nTop || !result.nRest) && (
            <p className="an-small" style={{ margin: '0 0 10px' }}>
              All {result.n} simulated decks are {result.nTop ? 'top-8' : 'non-top-8'} finishes (card lists have so far only been
              scraped for top-8 decks), so the top-8 vs rest comparison can&apos;t be made; only the placement-percentile
              correlation is informative.
            </p>
          )}
          <table className="an-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="an-num">Mean (top-8, n={result.nTop})</th>
                <th className="an-num">Mean (rest, n={result.nRest})</th>
                <th className="an-num">r vs top-8</th>
                <th className="an-num">p</th>
                <th className="an-num">ρ vs placement %</th>
                <th className="an-num">p</th>
                <th className="an-num">n</th>
              </tr>
            </thead>
            <tbody>
              {result.results.map((r) => (
                <tr key={r.key} className={r.meaningful ? '' : 'an-faded'}>
                  <td>{r.label}</td>
                  <td className="an-num">{r.top8.meanTop == null ? '—' : r.top8.meanTop.toFixed(2)}</td>
                  <td className="an-num">{r.top8.meanRest == null ? '—' : r.top8.meanRest.toFixed(2)}</td>
                  <td className="an-num">{fmtR(r.top8.r)}</td>
                  <td className="an-num">{fmtP(r.top8.p)}</td>
                  <td className="an-num">{fmtR(r.percentile.rho)}</td>
                  <td className="an-num">{fmtP(r.percentile.p)}</td>
                  <td className="an-num">{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
