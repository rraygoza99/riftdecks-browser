import { useMemo, useState } from 'react'
import { analyzeConversionRates } from '../analytics/conversionRates'
import { tournamentKey } from '../tournamentUtils'
import './ConversionView.css'

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
  Unproven: 'Not enough finishing pedigree to sort into the tiers above.',
}

const MIN_CUT_OPTIONS = [1, 3, 5, 10]

export default function ConversionView({ allDecks }) {
  const [minTopCut, setMinTopCut] = useState(5)

  // Flatten the app's deck list into PlacementEntry[] for the analytics module.
  const placements = useMemo(
    () =>
      allDecks.map((d) => ({
        tournamentId: tournamentKey(d),
        player: d.deckName ?? null,
        legendName: d.legendName,
        placement: d.standing,
        decklist: d.deckUrl ?? null,
      })),
    [allDecks],
  )

  const result = useMemo(
    () => analyzeConversionRates(placements, { minTopCut }),
    [placements, minTopCut],
  )

  const { summary, tiers } = result

  const avgConversion = useMemo(() => {
    if (!summary.length) return 0
    return summary.reduce((a, r) => a + r.conversionRate, 0) / summary.length
  }, [summary])

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
          <strong>conversion rate</strong> is the share of Top-32 appearances that turned into a Top
          4, Finals, or 1st-place finish; the <strong>drop-off stage</strong> is where a legend most
          often bows out. Legends are then sorted into archetype tiers based on presence and
          finishing power.
        </p>
      </header>

      <div className="conv-summary">
        <div className="conv-stat">
          <span className="conv-stat-num">{summary.length}</span>
          <span className="conv-stat-label">Legends analyzed</span>
        </div>
        <div className="conv-stat">
          <span className="conv-stat-num">{avgConversion.toFixed(1)}%</span>
          <span className="conv-stat-label">Avg conversion</span>
        </div>
        <div className="conv-controls">
          <span className="conv-controls-label">Min. Top Cut</span>
          <div className="conv-seg">
            {MIN_CUT_OPTIONS.map((n) => (
              <button
                key={n}
                type="button"
                className={`conv-seg-btn${minTopCut === n ? ' conv-seg-btn--active' : ''}`}
                onClick={() => setMinTopCut(n)}
              >
                {n}
              </button>
            ))}
          </div>
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
        <div className="app-status">No legends meet the current Top Cut threshold.</div>
      ) : (
        <div className="conv-table-wrap">
          <table className="conv-table">
            <thead>
              <tr>
                <th className="conv-th-legend">Legend</th>
                <th>Tier</th>
                <th className="conv-th-num">Top Cut</th>
                <th className="conv-th-conv">Conversion</th>
                <th className="conv-th-num">1st %</th>
                <th>Most common drop-off</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.legendName}>
                  <td className="conv-td-legend" title={r.legendName}>
                    {r.legendName}
                  </td>
                  <td>
                    <span className={`conv-badge ${TIER_CLASS[r.tier]}`}>{r.tier}</span>
                  </td>
                  <td className="conv-td-num">{r.topCutAppearances}</td>
                  <td>
                    <div className="conv-bar-cell">
                      <span className="conv-bar-track">
                        <span
                          className="conv-bar-fill"
                          style={{ width: `${Math.min(100, r.conversionRate)}%` }}
                        />
                      </span>
                      <span className="conv-bar-value">{r.conversionRate}%</span>
                    </div>
                  </td>
                  <td className="conv-td-num">{r.firstPlaceRate}%</td>
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
