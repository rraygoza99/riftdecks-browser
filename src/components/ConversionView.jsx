import { useMemo, useState } from 'react'
import { analyzeConversionRates } from '../analytics/conversionRates'
import { tournamentKey } from '../tournamentUtils'
import AnalyticsBar, { MinSampleControl } from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import { applyScope, describeScope, countEvents } from '../data/scope'
import { MIN_SAMPLE } from '../stats/stats'
import './ConversionView.css'
import './Analytics.css'

const TIER_CLASS = {
  Closer: 'tier-closer',
  Gatekeeper: 'tier-gatekeeper',
  'Fringe / Dark Horse': 'tier-fringe',
  Unproven: 'tier-unproven',
}

const TIER_BLURB = {
  Closer: 'High Top Cut presence that keeps converting into 1st-place finishes.',
  Gatekeeper: 'Shows up everywhere in the cut but rarely closes out the trophy.',
  'Fringe / Dark Horse': 'Low overall presence, but punches above its weight once it makes the cut.',
  Unproven: 'Not enough finishing pedigree (or sample) to sort into the tiers above.',
}

const MIN_CUT_OPTIONS = [1, 3, 5, 10, 20]

export default function ConversionView({ allDecks, scope, onScopeChange, legendOptions, metaOptions, coverage }) {
  const [minTopCut, setMinTopCut] = useState(MIN_SAMPLE.topCut)
  const [hideSmall, setHideSmall] = useState(false)

  const decks = useMemo(
    () => applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage }),
    [allDecks, scope, coverage]
  )

  // Flatten the scoped deck list into PlacementEntry[] for the analytics module.
  const placements = useMemo(
    () =>
      decks.map((d) => ({
        tournamentId: tournamentKey(d),
        player: d.deckName ?? null,
        legendName: d.legendName,
        placement: d.standing,
        decklist: d.deckUrl ?? null,
      })),
    [decks]
  )

  const result = useMemo(() => analyzeConversionRates(placements, { minTopCut }), [placements, minTopCut])
  const { tiers } = result
  const focus = scope.legends?.length ? new Set(scope.legends) : null
  const summary = result.summary.filter((r) => (!focus || focus.has(r.legendName)) && (!hideSmall || r.eligible))
  const eligibleCount = result.summary.filter((r) => r.eligible).length

  const avgConversion = useMemo(() => {
    const rows = result.summary.filter((r) => r.eligible)
    const cut = rows.reduce((a, r) => a + r.topCutAppearances, 0)
    const conv = rows.reduce((a, r) => a + r.converted, 0)
    return cut ? (conv / cut) * 100 : 0
  }, [result])

  const downloadJson = () => {
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'legend-conversion-rates.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="conv-view">
      <header className="conv-intro">
        <h1 className="conv-intro-title">Legend Conversion Rates</h1>
        <p className="conv-intro-text">
          A funnel view of how each Champion Legend performs once it reaches a Top Cut. The{' '}
          <strong>conversion rate</strong> is the share of Top-32 appearances that turned into a Top 4,
          Finals, or 1st-place finish; the <strong>drop-off stage</strong> is where a legend most often
          bows out. Legends are ranked by the lower bound of their 95% interval so small samples
          can&apos;t top the table, then sorted into archetype tiers based on presence and finishing power.
        </p>
      </header>

      <AnalyticsBar scope={scope} onScopeChange={onScopeChange} legendOptions={legendOptions} metaOptions={metaOptions}>
        <MinSampleControl value={minTopCut} onChange={setMinTopCut} label="Min. Top Cut" options={MIN_CUT_OPTIONS} />
        <label className="filter-group">
          <span className="filter-label">Below minimum</span>
          <label className="filter-toggle">
            <input type="checkbox" checked={hideSmall} onChange={(e) => setHideSmall(e.target.checked)} />
            <span>Hide</span>
          </label>
        </label>
      </AnalyticsBar>

      <DataSourceNote
        dataset="placements"
        filters={describeScope(scope, { skip: ['maxPrice', 'maxPlacePct', 'maxPlacement', 'legends'] })}
        counts={`${decks.length.toLocaleString()} decks · ${countEvents(decks)} events · ${result.summary.length} legends with a Top-32 finish (${eligibleCount} with ≥ ${minTopCut})`}
        extra="Top Cut = finishes ≤ 32nd; legends that never reached a Top 32 aren't listed here, which is why this page shows fewer legends than Meta."
      />

      <div className="conv-summary">
        <div className="conv-stat">
          <span className="conv-stat-num">{eligibleCount}</span>
          <span className="conv-stat-label">Legends ≥ {minTopCut} top cuts</span>
        </div>
        <div className="conv-stat">
          <span className="conv-stat-num">{avgConversion.toFixed(1)}%</span>
          <span className="conv-stat-label">Pooled conversion</span>
        </div>
        <div className="conv-controls">
          <button type="button" className="conv-download" onClick={downloadJson}>
            Export JSON
          </button>
        </div>
      </div>

      <div className="conv-tiers">
        {Object.entries(TIER_BLURB).map(([tier, blurb]) => (
          <div key={tier} className={`conv-tier-card ${TIER_CLASS[tier]}`}>
            <span className="conv-tier-name">{tier}</span>
            <span className="conv-tier-count">{tiers[tier]?.length ?? 0}</span>
            <span className="conv-tier-blurb">{blurb}</span>
          </div>
        ))}
      </div>

      {summary.length === 0 ? (
        <div className="app-status">No legends meet the current filters.</div>
      ) : (
        <div className="conv-table-wrap">
          <table className="conv-table">
            <thead>
              <tr>
                <th className="conv-th-num">#</th>
                <th className="conv-th-legend">Legend</th>
                <th>Tier</th>
                <th className="conv-th-num">Top Cut</th>
                <th className="conv-th-conv">Conversion (95% CI)</th>
                <th className="conv-th-num">1st %</th>
                <th>Most common drop-off</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r, i) => (
                <tr key={r.legendName} className={r.eligible ? '' : 'an-faded'} title={r.eligible ? '' : `Below the minimum of ${minTopCut} top cuts`}>
                  <td className="conv-td-num">{r.eligible ? i + 1 : '—'}</td>
                  <td className="conv-td-legend" title={r.legendName}>
                    {r.legendName}
                  </td>
                  <td>
                    <span className={`conv-badge ${TIER_CLASS[r.tier]}`}>{r.tier}</span>
                  </td>
                  <td className="conv-td-num">{r.topCutAppearances}</td>
                  <td>
                    <div className="conv-bar-cell">
                      <span className="conv-bar-track" style={{ position: 'relative' }}>
                        <span className="conv-bar-fill" style={{ width: `${Math.min(100, r.conversionRate)}%` }} />
                        <span
                          className="an-bar-ci"
                          style={{ left: `${r.conversionLow}%`, width: `${r.conversionHigh - r.conversionLow}%` }}
                        />
                      </span>
                      <span className="conv-bar-value" title={`95% interval ${r.conversionLow}–${r.conversionHigh}%`}>
                        {r.conversionRate}% · {r.converted}/{r.topCutAppearances}
                      </span>
                    </div>
                  </td>
                  <td className="conv-td-num" title={`95% interval ${r.firstPlaceLow}–${r.firstPlaceHigh}%`}>
                    {r.firstPlaceRate}% · {r.firstPlace}/{r.topCutAppearances}
                  </td>
                  <td className="conv-td-drop">
                    {r.dropOff ? (
                      <>
                        {r.dropOff.stage}
                        <span className="conv-drop-rate"> ({r.dropOff.dropRate}%)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
