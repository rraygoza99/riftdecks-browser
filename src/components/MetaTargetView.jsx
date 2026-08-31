import { useMemo, useState } from 'react'
import { analyzeMetaTargeting } from '../analytics/metaTargeting'
import winrateData from '../../data/winrate-matrix.json'
import './MetaTargetView.css'

const TIER_CLASS = {
  Oppressor: 'mt-tier-oppressor',
  Pillar: 'mt-tier-pillar',
  Overexposed: 'mt-tier-overexposed',
  Sleeper: 'mt-tier-sleeper',
  Niche: 'mt-tier-niche',
  Underdog: 'mt-tier-underdog',
  Unproven: 'mt-tier-unproven',
}

const short = (name) => (name || '').split(',')[0]

function WrCell({ pct }) {
  const cls = pct >= 55 ? 'mt-wr-good' : pct <= 45 ? 'mt-wr-bad' : 'mt-wr-even'
  return <span className={`mt-wr ${cls}`}>{pct}%</span>
}

export default function MetaTargetView() {
  const [minMatches, setMinMatches] = useState(30)

  const result = useMemo(
    () => analyzeMetaTargeting(winrateData, { minMatches }),
    [minMatches],
  )

  const { vulnerabilityMatrix, recommendations, metaLegends, matchesAnalyzed, metagame } = result

  const downloadJson = () => {
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'meta-vulnerability.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="mt-view">
      <header className="mt-intro">
        <h1 className="mt-intro-title">Meta Targeting</h1>
        <p className="mt-intro-text">
          A vulnerability map of the current field, built from the riftDecks head-to-head winrate
          matrix ({matchesAnalyzed.toLocaleString()} matches). It ranks the most-played legends by how
          exploitable they are, lists their real counters, and surfaces underplayed{' '}
          <strong>anti-meta picks</strong> with the best record against the popular field.
        </p>
      </header>

      <div className="mt-toolbar">
        <div className="mt-meta-tags">
          <span className="mt-meta-label">{metagame} · meta:</span>
          {metaLegends.map((n) => (
            <span key={n} className="mt-chip">
              {short(n)}
            </span>
          ))}
        </div>
        <div className="mt-controls">
          <span className="mt-controls-label">Min. matches</span>
          <div className="mt-seg">
            {[15, 30, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                className={`mt-seg-btn${minMatches === n ? ' mt-seg-btn--active' : ''}`}
                onClick={() => setMinMatches(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <button type="button" className="mt-download" onClick={downloadJson}>
            Export JSON
          </button>
        </div>
      </div>

      <h2 className="mt-section-title">Meta Vulnerability Matrix</h2>
      <p className="mt-section-sub">
        Popular legends, most exploitable first. Vulnerability = presence weighted by how much the
        field beats them.
      </p>
      <div className="mt-table-wrap">
        <table className="mt-table">
          <thead>
            <tr>
              <th>Legend</th>
              <th>Tier</th>
              <th className="mt-num">Presence</th>
              <th className="mt-num">Exp. WR</th>
              <th className="mt-num">Vuln.</th>
              <th>Top counters (winrate vs them)</th>
            </tr>
          </thead>
          <tbody>
            {vulnerabilityMatrix.map((v) => (
              <tr key={v.legend}>
                <td className="mt-td-legend" title={v.legend}>
                  {short(v.legend)}
                </td>
                <td>
                  <span className={`mt-badge ${TIER_CLASS[v.tier]}`}>{v.tier}</span>
                </td>
                <td className="mt-num">{v.presencePct}%</td>
                <td className="mt-num">{v.expectedWinratePct}%</td>
                <td className="mt-num mt-vuln">{v.vulnerabilityIndex}</td>
                <td className="mt-td-counters">
                  {v.worstMatchups.length ? (
                    v.worstMatchups.map((m) => (
                      <span key={m.opponent} className="mt-counter">
                        {short(m.opponent)} <WrCell pct={m.winrateAgainstPct} />
                      </span>
                    ))
                  ) : (
                    <span className="mt-muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-section-title">Anti-Meta Picks</h2>
      <p className="mt-section-sub">
        Underplayed legends (outside the top field) with the strongest record against the meta, and
        which popular decks they punish.
      </p>
      <div className="mt-cards">
        {recommendations.antiMeta.map((r) => (
          <article key={r.legend} className="mt-card">
            <header className="mt-card-head">
              <span className="mt-card-name">{short(r.legend)}</span>
              <span className={`mt-badge ${TIER_CLASS[r.tier]}`}>{r.tier}</span>
            </header>
            <div className="mt-card-stats">
              <span>
                Presence <strong>{r.presencePct}%</strong>
              </span>
              <span>
                vs Meta <strong>{r.vsMetaWinratePct}%</strong>
              </span>
            </div>
            <ul className="mt-punishes">
              {r.punishes.map((p) => (
                <li key={p.legend}>
                  <span>{short(p.legend)}</span>
                  <WrCell pct={p.winratePct} />
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <p className="mt-notes">{recommendations.notes}</p>
    </section>
  )
}
