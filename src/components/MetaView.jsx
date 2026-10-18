import { useMemo, useState } from 'react'
import LineChart from './LineChart'
import AnalyticsBar, { MinSampleControl } from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import { applyScope, describeScope, countEvents } from '../data/scope'
import { REGIONS } from '../data/regions'
import { legendCounts, rankByRate, weightedPerformance, topCutRatio, regionSplit } from '../analytics/metaStats'
import { formatRateN, formatInterval, formatPct, MIN_SAMPLE } from '../stats/stats'
import './MetaView.css'
import './Analytics.css'

const fmtMoney = (v) => `$${Math.round(v)}`
const short = (name) => (name || '').split(',')[0]

function BarList({ rows, max, valueLabel, ci }) {
  if (!rows.length) return <div className="chart-empty">Not enough data.</div>
  return (
    <ul className="meta-bars">
      {rows.map((r) => (
        <li key={r.name} className={`meta-bar-row${r.eligible === false ? ' an-faded' : ''}`}>
          <span className="meta-bar-name" title={r.name}>
            {r.name}
          </span>
          <span className="meta-bar-track">
            <span className="meta-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
            {ci && (
              <span
                className="an-bar-ci"
                style={{ left: `${(r.low / max) * 100}%`, width: `${(Math.min(r.high, max) / max - r.low / max) * 100}%` }}
                title={`95% interval ${(r.low * 100).toFixed(1)}–${(r.high * 100).toFixed(1)}%`}
              />
            )}
          </span>
          <span className="meta-bar-value">{valueLabel(r)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function MetaView({ allDecks, scope, onScopeChange, legendOptions, metaOptions, coverage }) {
  const [minN, setMinN] = useState(MIN_SAMPLE.legendDecks)
  const [perfMode, setPerfMode] = useState('raw')
  // 1st-place rates sit near 3%, where shrinkage separates small samples better
  // than the Wilson bound; Wilson stays one click away.
  const [rankMethod, setRankMethod] = useState('shrink')

  // Share/rate stats use the whole scoped field; the legend filter only
  // narrows which rows are shown.
  const decks = useMemo(
    () => applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage }),
    [allDecks, scope, coverage]
  )
  const focus = scope.legends?.length ? new Set(scope.legends) : null
  const shown = (name) => !focus || focus.has(name)

  const stats = useMemo(() => {
    const rows = legendCounts(decks)
    // Popularity respects the placement filter: "share among top-N decks".
    const popDecks = scope.maxPlacement > 0 ? decks.filter((d) => d.standing <= scope.maxPlacement) : decks
    const popRows = legendCounts(popDecks)
    const popularity = popRows
      .filter((r) => shown(r.name))
      .slice(0, 15)
      .map((r) => ({ name: r.name, value: r.decks, k: r.decks, n: popDecks.length }))
    const firsts = rankByRate(rows, 'firsts', { minN, method: rankMethod })
      .filter((r) => shown(r.name))
      .slice(0, 20)
      .map((r) => ({ ...r, value: r.rate }))

    const byDay = new Map()
    for (const d of decks) {
      if (!d.tournamentDate || d.price == null) continue
      const key = d.tournamentDate.toISOString().slice(0, 10)
      if (!byDay.has(key)) byDay.set(key, { sum: 0, n: 0 })
      const e = byDay.get(key)
      e.sum += d.price
      e.n += 1
    }
    const trend = [...byDay.entries()]
      .map(([day, e]) => ({ x: new Date(day + 'T00:00:00Z').getTime(), y: e.sum / e.n, label: day }))
      .sort((a, b) => a.x - b.x)

    return {
      rows,
      popularity,
      popTotal: popDecks.length,
      firsts,
      trend,
      eligible: rows.filter((r) => r.decks >= minN).length,
    }
  }, [decks, minN, rankMethod, scope.maxPlacement, focus && [...focus].join('|')])

  const perf = useMemo(() => {
    const weighted = new Map(weightedPerformance(decks).map((r) => [r.name, r]))
    const ratio = topCutRatio(decks, { coverage })
    const rows = stats.rows
      .filter((r) => r.decks >= minN && shown(r.name))
      .map((r) => ({ ...r, w: weighted.get(r.name), ratio: ratio.rows.find((x) => x.name === r.name) }))
    const key = perfMode === 'raw' ? (r) => r.top8CI.low : (r) => r.w?.low ?? 0
    return { rows: rows.sort((a, b) => key(b) - key(a)).slice(0, 20), ratio }
  }, [decks, stats.rows, minN, perfMode, coverage, focus && [...focus].join('|')])

  const regions = useMemo(() => regionSplit(decks), [decks])
  const regionLegends = stats.rows.filter((r) => shown(r.name)).slice(0, 12)

  const popMax = stats.popularity[0]?.value || 1
  const winMax = Math.max(0.01, ...stats.firsts.map((r) => r.high))

  const formatTrendDate = (label) =>
    new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

  return (
    <section className="meta-view">
      <header className="meta-intro">
        <h1 className="meta-intro-title">Riftbound Meta Dashboard</h1>
        <p className="meta-intro-text">
          A living snapshot of the competitive Riftbound format, built from recent tournament results.
          Use <strong>popularity</strong> to see what the field is bringing, the{' '}
          <strong>1st-place rate</strong> to see what is converting into wins, and{' '}
          <strong>performance</strong> to compare top-8 rates with or without weighting by event size.
          These are placement-based statistics, not head-to-head match results. Rates are ranked by
          the lower bound of their 95% interval, so a 2-for-26 run can&apos;t outrank a legend with
          hundreds of results.
        </p>
      </header>

      <AnalyticsBar
        scope={scope}
        onScopeChange={onScopeChange}
        legendOptions={legendOptions}
        metaOptions={metaOptions}
        show={['dateRange', 'meta', 'region', 'legends', 'maxPlacement', 'minCoverage']}
      >
        <MinSampleControl value={minN} onChange={setMinN} label="Min. decks" options={[1, 5, 10, 20, 50]} />
      </AnalyticsBar>

      <DataSourceNote
        dataset="placements"
        filters={describeScope(scope, { skip: ['maxPrice', 'maxPlacePct', 'maxPlacement', 'legends'] })}
        counts={`${decks.length.toLocaleString()} decks · ${countEvents(decks)} events · ${stats.rows.length} legends (${stats.eligible} with ≥ ${minN} decks)`}
        extra="Legend counts differ by page on purpose: Conversion only lists legends with a Top-32 finish, card stats on Legends use only decks with scraped card lists, and Meta Targeting uses riftDecks match results (a different dataset)."
      />

      <div className="meta-summary">
        <div className="meta-stat">
          <span className="meta-stat-num">{decks.length.toLocaleString()}</span>
          <span className="meta-stat-label">Decks in scope</span>
        </div>
        <div className="meta-stat">
          <span className="meta-stat-num">{stats.rows.length}</span>
          <span className="meta-stat-label">Unique legends</span>
        </div>
        <div className="meta-stat">
          <span className="meta-stat-num">{stats.eligible}</span>
          <span className="meta-stat-label">Legends with ≥ {minN} decks</span>
        </div>
      </div>

      <div className="meta-grid">
        <article className="meta-card">
          <h2>Legend popularity</h2>
          <p className="meta-card-sub">
            Share of {scope.maxPlacement > 0 ? `top-${scope.maxPlacement} ` : ''}decks in scope (top 15) ·
            n = {stats.popTotal.toLocaleString()} decks.
          </p>
          <BarList rows={stats.popularity} max={popMax} valueLabel={(r) => formatRateN(r.k, r.n)} />
        </article>

        <article className="meta-card">
          <div className="an-row" style={{ justifyContent: 'space-between' }}>
            <h2>1st-place rate by legend</h2>
            <div className="filter-seg">
              {[
                ['wilson', 'Wilson lower bound'],
                ['shrink', 'Shrinkage'],
              ].map(([k, l]) => (
                <button key={k} type="button" className={`seg-btn ${rankMethod === k ? 'seg-btn--active' : ''}`} onClick={() => setRankMethod(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="meta-card-sub">
            Ranked by {rankMethod === 'wilson' ? 'the 95% Wilson lower bound' : 'the rate shrunk toward the average 1st-place rate (empirical-Bayes prior)'}; bars show the raw rate with its 95% interval. Legends with fewer
            than {minN} decks are faded and listed last.
          </p>
          <BarList
            rows={stats.firsts}
            max={winMax}
            ci
            valueLabel={(r) => (
              <span title={`95% interval ${formatInterval(r.k, r.n)}`}>{formatRateN(r.k, r.n)}</span>
            )}
          />
        </article>

        <article className="meta-card meta-card--wide">
          <div className="an-row" style={{ justifyContent: 'space-between' }}>
            <h2>Performance: top-8 rate</h2>
            <div className="filter-seg">
              {[
                ['raw', 'Raw'],
                ['weighted', 'Weighted by event size'],
              ].map(([k, l]) => (
                <button key={k} type="button" className={`seg-btn ${perfMode === k ? 'seg-btn--active' : ''}`} onClick={() => setPerfMode(k)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <p className="meta-card-sub">
            Raw = share of a legend&apos;s decks that finished top 8. Weighted = the same with each result
            weighted by log₂(players), so big events count more (n<sub>eff</sub> is the effective sample).
            Top-cut ÷ field share uses only fully covered events ({perf.ratio.events} events,{' '}
            {perf.ratio.decks.toLocaleString()} decks): above 1 means the legend takes more top-8 slots than
            its share of the field. Ranked by the lower bound of the chosen rate.
          </p>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Legend</th>
                  <th className="an-num">Top-8 rate (raw)</th>
                  <th className="an-num">Weighted</th>
                  <th className="an-num">Top-cut ÷ field (full events)</th>
                </tr>
              </thead>
              <tbody>
                {perf.rows.map((r) => (
                  <tr key={r.name}>
                    <td title={r.name}>{short(r.name)}</td>
                    <td className="an-num" title={`95% interval ${formatInterval(r.top8, r.decks)}`}>
                      {formatRateN(r.top8, r.decks)}
                    </td>
                    <td className="an-num" title={r.w ? `95% interval ${(r.w.low * 100).toFixed(1)}–${(r.w.high * 100).toFixed(1)}%` : ''}>
                      {r.w ? `${formatPct(r.w.weightedRate)} · n_eff ${r.w.nEff.toFixed(0)}` : '—'}
                    </td>
                    <td className="an-num">
                      {r.ratio ? (
                        <span className={r.ratio.p < 0.05 ? (r.ratio.ratio > 1 ? 'an-up' : 'an-down') : ''} title={`p = ${r.ratio.p.toFixed(3)}`}>
                          {r.ratio.ratio.toFixed(2)}× · {r.ratio.cutDecks}/{r.ratio.fieldDecks}
                        </span>
                      ) : (
                        <span className="an-muted">no full events</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="meta-card meta-card--wide">
          <h2>Region split</h2>
          <p className="meta-card-sub">
            Meta share and top-8 conversion per region (from the tournament&apos;s country; events without a
            country are &quot;Unknown&quot;). Use the Region filter above to scope every page to one region.
          </p>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Legend</th>
                  {REGIONS.map((r) => (
                    <th key={r} className="an-num">
                      {r} <span className="an-small">({regions[r].decks})</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {regionLegends.map((l) => (
                  <tr key={l.name}>
                    <td title={l.name}>{short(l.name)}</td>
                    {REGIONS.map((r) => {
                      const x = regions[r].legends.get(l.name)
                      return (
                        <td key={r} className="an-num" title={x ? `Top-8: ${formatRateN(x.top8, x.decks)}` : ''}>
                          {x ? (
                            <>
                              {formatRateN(x.decks, regions[r].decks)}
                              <div className="an-small">T8 {x.decks ? formatPct(x.top8 / x.decks, 0) : '—'}</div>
                            </>
                          ) : (
                            <span className="an-muted">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="meta-card meta-card--wide">
          <h2>Average deck price over time</h2>
          <p className="meta-card-sub">Mean price of decks per tournament day.</p>
          <LineChart data={stats.trend} formatY={fmtMoney} formatX={formatTrendDate} />
        </article>
      </div>
    </section>
  )
}
