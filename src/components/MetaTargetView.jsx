import { useMemo, useState } from 'react'
import { analyzeMetaTargeting } from '../analytics/metaTargeting'
import {
  expectedVsField, fieldFromMatrix, fieldFromDecks, matchup, normalizeField, probabilityTable, simulateSwiss, DEFAULT_PRIOR_MATCHES,
} from '../analytics/matchups'
import { applyScope, describeScope } from '../data/scope'
import { REGIONS } from '../data/regions'
import { wilsonInterval, formatPct } from '../stats/stats'
import AnalyticsBar from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import winrateData from '../../data/winrate-matrix.json'
import './MetaTargetView.css'
import './Analytics.css'

const TIER_CLASS = {
  Oppressor: 'mt-tier-oppressor',
  Pillar: 'mt-tier-pillar',
  Overexposed: 'mt-tier-overexposed',
  Sleeper: 'mt-tier-sleeper',
  Niche: 'mt-tier-niche',
  Underdog: 'mt-tier-underdog',
  Unproven: 'mt-tier-unproven',
}

const TABS = [
  ['targets', 'Vulnerability & anti-meta'],
  ['expected', 'Expected WR vs field'],
  ['matrix', 'Matchup matrix'],
  ['sim', 'Tournament simulator'],
]

const short = (name) => (name || '').split(',')[0]
const MATRIX_LEGENDS = (winrateData.legends || []).map((l) => l.name)
const GLOBAL_FIELD = fieldFromMatrix(winrateData)
const SOURCE_DATE = winrateData.source?.scrapedAt
  ? new Date(winrateData.source.scrapedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'unknown date'
const SOURCE_RANGE = (winrateData.source?.dateRange || '').replace(/_/g, ' ')

function WrCell({ pct }) {
  const cls = pct >= 55 ? 'mt-wr-good' : pct <= 45 ? 'mt-wr-bad' : 'mt-wr-even'
  return <span className={`mt-wr ${cls}`}>{pct}%</span>
}

function Seg({ value, options, onChange }) {
  return (
    <div className="filter-seg">
      {options.map(([v, l]) => (
        <button key={v} type="button" className={`seg-btn ${value === v ? 'seg-btn--active' : ''}`} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  )
}

export default function MetaTargetView({ allDecks = [], scope, onScopeChange, legendOptions, metaOptions, coverage }) {
  const [tab, setTab] = useState('targets')
  const [minMatches, setMinMatches] = useState(30)
  const [underplayedPct, setUnderplayedPct] = useState(0.5)
  const [prior, setPrior] = useState(DEFAULT_PRIOR_MATCHES)
  const [fieldMode, setFieldMode] = useState('global')
  const [custom, setCustom] = useState(() => Object.fromEntries([...GLOBAL_FIELD.entries()].map(([k, v]) => [k, Math.round(v * 1000) / 10])))

  const result = useMemo(
    () => analyzeMetaTargeting(winrateData, { minMatches, underplayedPercentile: underplayedPct }),
    [minMatches, underplayedPct]
  )
  const { vulnerabilityMatrix, recommendations, metaLegends, matchesAnalyzed, metagame, underplayed } = result

  // Field to evaluate against: matrix presence, a region's tournament decks, or custom sliders.
  const fieldInfo = useMemo(() => {
    if (fieldMode === 'global') return { field: GLOBAL_FIELD, label: 'global (riftDecks match presence)' }
    if (fieldMode === 'custom') return { field: normalizeField(custom), label: 'custom mix' }
    const region = fieldMode.slice('region:'.length)
    const decks = applyScope(allDecks, { ...scope, region }, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage })
    const f = fieldFromDecks(decks, MATRIX_LEGENDS)
    return {
      field: f.field,
      label: `${region} tournament decks (${f.decks.toLocaleString()} decks, ${describeScope({ ...scope, region }, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'] })})`,
      unmatchedShare: f.unmatchedShare,
    }
  }, [fieldMode, custom, allDecks, scope, coverage])

  const presencePctOnMeta = useMemo(() => {
    const decks = applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage })
    const kennen = 'Kennen, Heart of the Tempest'
    return decks.length ? decks.filter((d) => d.legendName === kennen).length / decks.length : null
  }, [allDecks, scope, coverage])

  const downloadJson = () => {
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'meta-vulnerability.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const kennenHere = result.field.find((f) => f.legend.startsWith('Kennen'))?.presencePct

  return (
    <section className="mt-view">
      <header className="mt-intro">
        <h1 className="mt-intro-title">Meta Targeting</h1>
        <p className="mt-intro-text">
          Built from the riftDecks head-to-head winrate matrix ({matchesAnalyzed.toLocaleString()} matches). Find the
          most exploitable popular legends and their counters, estimate each legend&apos;s expected winrate against a
          field of your choice, browse every matchup, and simulate a Swiss tournament.
        </p>
      </header>

      <DataSourceNote
        dataset="matches"
        filters={`${metagame} · ${SOURCE_RANGE} · scraped ${SOURCE_DATE} · date/meta filters don't apply to this dataset`}
        counts={`${matchesAnalyzed.toLocaleString()} matches · ${MATRIX_LEGENDS.length} legends`}
        extra={
          kennenHere != null && presencePctOnMeta != null
            ? `Presence here = share of match seats in riftDecks data, so it differs from deck share on Meta (e.g. Kennen ${kennenHere}% here vs ${formatPct(presencePctOnMeta)} of tournament decks in your current scope).`
            : null
        }
      />

      <div className="an-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" className={`an-tab${tab === k ? ' an-tab--active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'targets' && (
        <>
          <div className="mt-toolbar">
            <div className="mt-meta-tags">
              <span className="mt-meta-label">{metagame} · top-8 meta:</span>
              {metaLegends.map((n) => (
                <span key={n} className="mt-chip">
                  {short(n)}
                </span>
              ))}
            </div>
            <div className="mt-controls">
              <span className="mt-controls-label">Min. matches</span>
              <Seg value={minMatches} options={[15, 30, 50, 100].map((n) => [n, n])} onChange={setMinMatches} />
              <button type="button" className="mt-download" onClick={downloadJson}>
                Export JSON
              </button>
            </div>
          </div>

          <h2 className="mt-section-title">Meta Vulnerability Matrix</h2>
          <p className="mt-section-sub">
            Popular legends (presence ≥ median), most exploitable first. Vulnerability = presence × how much the
            field beats them. Counter winrates use cells with ≥ {minMatches} matches; n is shown per counter.
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
                  <th>Top counters (winrate vs them · n)</th>
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
                    <td className="mt-num">{v.expectedWinratePct ?? '—'}%</td>
                    <td className="mt-num mt-vuln">{v.vulnerabilityIndex}</td>
                    <td className="mt-td-counters">
                      {v.worstMatchups.length ? (
                        v.worstMatchups.map((m) => (
                          <span key={m.opponent} className="mt-counter">
                            {short(m.opponent)} <WrCell pct={m.winrateAgainstPct} /> <span className="an-small">· {m.matches}</span>
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
          <div className="an-row" style={{ marginBottom: 8 }}>
            <span className="mt-controls-label">Underplayed = presence at or below the</span>
            <Seg
              value={underplayedPct}
              options={[
                [0.25, '25th'],
                [0.5, 'median'],
                [0.75, '75th'],
              ]}
              onChange={setUnderplayedPct}
            />
            <span className="mt-controls-label">percentile</span>
          </div>
          <p className="mt-section-sub">
            <strong>Underplayed</strong> = outside the top-8 meta and presence ≤ {underplayed.maxPresencePct}% (the{' '}
            {underplayedPct === 0.5 ? 'median' : `${Math.round(underplayedPct * 100)}th percentile`} of all {MATRIX_LEGENDS.length}{' '}
            legends&apos; presence), with at least {underplayed.minPresencePct}% presence so there are games to judge them on.
            Ranked by winrate against the top-8 meta.
          </p>
          {recommendations.antiMeta.length === 0 ? (
            <div className="an-empty">No underplayed legend beats the meta with the current thresholds.</div>
          ) : (
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
          )}
          <p className="mt-notes">{recommendations.notes}</p>
        </>
      )}

      {(tab === 'expected' || tab === 'sim') && (
        <FieldPicker
          fieldMode={fieldMode}
          setFieldMode={setFieldMode}
          custom={custom}
          setCustom={setCustom}
          prior={prior}
          setPrior={setPrior}
          fieldInfo={fieldInfo}
          scope={scope}
          onScopeChange={onScopeChange}
          legendOptions={legendOptions}
          metaOptions={metaOptions}
        />
      )}
      {tab === 'expected' && <ExpectedPanel field={fieldInfo.field} prior={prior} focus={scope.legends} />}
      {tab === 'matrix' && <MatrixPanel prior={prior} setPrior={setPrior} />}
      {tab === 'sim' && <SimulatorPanel field={fieldInfo.field} prior={prior} />}
    </section>
  )
}

function FieldPicker({ fieldMode, setFieldMode, custom, setCustom, prior, setPrior, fieldInfo, scope, onScopeChange, legendOptions, metaOptions }) {
  const top = [...GLOBAL_FIELD.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k]) => k)
  return (
    <div className="an-card">
      <div className="an-row">
        <label className="filter-group">
          <span className="filter-label">Field</span>
          <select className="filter-select" value={fieldMode} onChange={(e) => setFieldMode(e.target.value)}>
            <option value="global">Global (riftDecks match presence)</option>
            {REGIONS.map((r) => (
              <option key={r} value={`region:${r}`}>
                Region {r} (tournament deck shares)
              </option>
            ))}
            <option value="custom">Custom mix (sliders)</option>
          </select>
        </label>
        <label className="filter-group">
          <span className="filter-label">Shrinkage prior (matches at 50%)</span>
          <Seg value={prior} options={[[0, 'none'], [10, '10'], [20, '20'], [50, '50']]} onChange={setPrior} />
        </label>
      </div>
      {fieldMode.startsWith('region:') && (
        <div style={{ marginTop: 10 }}>
          <AnalyticsBar scope={scope} onScopeChange={onScopeChange} legendOptions={legendOptions} metaOptions={metaOptions} show={['dateRange', 'meta', 'minCoverage']} />
        </div>
      )}
      <p className="an-sub" style={{ marginTop: 10 }}>
        Field: {fieldInfo.label}.
        {fieldInfo.unmatchedShare ? ` ${formatPct(fieldInfo.unmatchedShare)} of those decks are legends the matrix doesn't cover and are left out.` : ''}
      </p>
      {fieldMode === 'custom' && (
        <>
          <div className="an-slider-grid">
            {top.map((l) => (
              <div key={l} className="an-slider-row">
                <span title={l}>{short(l)}</span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="0.5"
                  value={custom[l] ?? 0}
                  onChange={(e) => setCustom((prev) => ({ ...prev, [l]: Number(e.target.value) }))}
                />
                <span className="an-num">{(custom[l] ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
          <div className="an-row" style={{ marginTop: 8 }}>
            <span className="an-small">
              Weights are relative (normalised to 100%); the {GLOBAL_FIELD.size - top.length} less-played legends keep their global weight.
            </span>
            <button
              type="button"
              className="an-btn an-btn--ghost"
              onClick={() => setCustom(Object.fromEntries([...GLOBAL_FIELD.entries()].map(([k, v]) => [k, Math.round(v * 1000) / 10])))}
            >
              Reset to global
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const scale = (p) => Math.max(0, Math.min(100, ((p - 0.3) / 0.4) * 100))

function ExpectedPanel({ field, prior, focus }) {
  const rows = useMemo(() => expectedVsField(winrateData.matrix, MATRIX_LEGENDS, field, { priorStrength: prior }), [field, prior])
  const focusSet = focus?.length ? new Set(focus) : null
  return (
    <div className="an-card">
      <h3>Expected winrate vs the field</h3>
      <p className="an-sub">
        Σ (opponent share × matchup winrate), mirror = 50%. Each matchup is shrunk toward 50% by a prior worth {prior}{' '}
        matches, so thin matchups don&apos;t swing the estimate. The band is ±1.96 standard errors propagated from each
        matchup&apos;s sample size. &quot;Field covered&quot; = share of the field with real head-to-head data.
      </p>
      <div className="an-table-wrap">
        <table className="an-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Legend</th>
              <th className="an-num">Field share</th>
              <th style={{ minWidth: 220 }}>Expected WR (95% band)</th>
              <th className="an-num">Field covered</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.legend} className={(focusSet && !focusSet.has(r.legend)) || r.coveredShare < 0.5 ? 'an-faded' : ''}>
                <td className="an-num">{i + 1}</td>
                <td title={r.legend}>{short(r.legend)}</td>
                <td className="an-num">{formatPct(field.get(r.legend) || 0)}</td>
                <td>
                  <div className="an-bar-cell">
                    <span className="an-bar-track">
                      {/* Axis spans 30%–70% winrate. */}
                      <span className="an-bar-fill" style={{ width: `${scale(r.ewr)}%` }} />
                      <span className="an-bar-ci" style={{ left: `${scale(r.low)}%`, width: `${scale(r.high) - scale(r.low)}%` }} />
                    </span>
                    <span className="an-num">
                      {formatPct(r.ewr)} <span className="an-small">({formatPct(r.low, 0)}–{formatPct(r.high, 0)})</span>
                    </span>
                  </div>
                </td>
                <td className="an-num">{formatPct(r.coveredShare, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatrixPanel({ prior, setPrior }) {
  const [topN, setTopN] = useState(20)
  const [shrunk, setShrunk] = useState(false)
  const legends = useMemo(() => [...GLOBAL_FIELD.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k]) => k), [topN])
  return (
    <div className="an-card">
      <h3>Matchup matrix</h3>
      <p className="an-sub">
        Row legend&apos;s winrate vs the column legend, with the number of matches. Colour = direction (green
        favoured, red unfavoured); opacity = confidence (n / (n + 50)), so faint cells are thin samples.
      </p>
      <div className="an-row" style={{ marginBottom: 10 }}>
        <span className="filter-label">Legends</span>
        <Seg value={topN} options={[[12, 'Top 12'], [20, 'Top 20'], [MATRIX_LEGENDS.length, 'All']]} onChange={setTopN} />
        <span className="filter-label">Values</span>
        <Seg value={shrunk} options={[[false, 'Raw'], [true, 'Shrunk']]} onChange={setShrunk} />
        {shrunk && <Seg value={prior} options={[[10, '10'], [20, '20'], [50, '50']]} onChange={setPrior} />}
      </div>
      <div className="an-table-wrap">
        <table className="an-table an-matrix">
          <thead>
            <tr>
              <th />
              {legends.map((c) => (
                <th key={c} className="an-matrix-col" title={c}>
                  {short(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {legends.map((r) => (
              <tr key={r}>
                <td className="an-matrix-row" title={r}>
                  {short(r)}
                </td>
                {legends.map((c) => {
                  if (r === c) return <td key={c} className="an-heat an-muted">—</td>
                  const m = matchup(winrateData.matrix, r, c, { priorStrength: prior })
                  if (!m.n) return <td key={c} className="an-heat an-muted" title="No matches">·</td>
                  const p = shrunk ? m.p : m.raw
                  const conf = m.n / (m.n + 50)
                  const color = p >= 0.5 ? '80, 200, 128' : '224, 80, 80'
                  const strength = Math.min(1, Math.abs(p - 0.5) * 5)
                  return (
                    <td
                      key={c}
                      className="an-heat"
                      style={{ background: `rgba(${color}, ${(0.12 + 0.6 * strength) * conf})` }}
                      title={`${short(r)} vs ${short(c)}: ${formatPct(m.raw)} raw over ${m.n} matches · shrunk ${formatPct(m.p)}`}
                    >
                      {Math.round(p * 100)}
                      <div className="an-small" style={{ fontSize: '0.6rem' }}>
                        {m.n}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SimulatorPanel({ field, prior }) {
  const [players, setPlayers] = useState(64)
  const [rounds, setRounds] = useState(6)
  const [topCut, setTopCut] = useState(8)
  const [sims, setSims] = useState(1000)
  const [chosen, setChosen] = useState(MATRIX_LEGENDS[0])
  const [res, setRes] = useState(null)
  const [running, setRunning] = useState(false)

  const run = () => {
    setRunning(true)
    setTimeout(() => {
      const table = probabilityTable(winrateData.matrix, MATRIX_LEGENDS, { priorStrength: prior })
      const out = simulateSwiss({ field, chosen, players, rounds, topCut, sims, table, seed: (Math.random() * 2 ** 31) | 0 })
      setRes({ ...out, cfg: { players, rounds, topCut, sims, chosen } })
      setRunning(false)
    }, 20)
  }

  const rows = res
    ? [...res.byLegend.entries()]
        .filter(([, s]) => s.entries > 0)
        .map(([legend, s]) => ({ legend, ...s, cut: wilsonInterval(s.topCut, s.entries), win: wilsonInterval(s.wins, s.entries) }))
        .sort((a, b) => b.cut.p - a.cut.p)
    : []
  const num = (v, set, lo, hi) => (
    <input className="an-input" type="number" min={lo} max={hi} value={v} onChange={(e) => set(Math.max(lo, Math.min(hi, Number(e.target.value) || lo)))} />
  )

  return (
    <div className="an-card">
      <h3>Swiss tournament simulator</h3>
      <p className="an-sub">
        Monte Carlo: opponents are drawn from the field above, each match is won with the shrunk matchup winrate,
        Swiss rounds pair players with equal points (avoiding rematches), and the top cut is single elimination.{' '}
        <strong>Assumptions:</strong> no player-skill modelling (everyone on a legend plays it equally well), no draws
        (the matrix has no draw data), random tiebreaks instead of opponent-match-win %, and matchups independent of
        list or round.
      </p>
      <div className="an-row" style={{ marginBottom: 12 }}>
        <label className="filter-group">
          <span className="filter-label">Your legend</span>
          <select className="filter-select" value={chosen} onChange={(e) => setChosen(e.target.value)}>
            {MATRIX_LEGENDS.map((l) => (
              <option key={l} value={l}>
                {short(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-group">
          <span className="filter-label">Players</span>
          {num(players, setPlayers, 4, 1024)}
        </label>
        <label className="filter-group">
          <span className="filter-label">Rounds</span>
          {num(rounds, setRounds, 1, 15)}
        </label>
        <label className="filter-group">
          <span className="filter-label">Top cut</span>
          {num(topCut, setTopCut, 0, 64)}
        </label>
        <label className="filter-group">
          <span className="filter-label">Simulations</span>
          <select className="filter-select" value={sims} onChange={(e) => setSims(Number(e.target.value))}>
            {[200, 1000, 3000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="an-btn" disabled={running || !field.size} onClick={run}>
          {running ? 'Simulating…' : 'Run'}
        </button>
      </div>
      {res && (
        <>
          <p>
            <strong>{short(res.cfg.chosen)}</strong> in a {res.cfg.players}-player, {res.cfg.rounds}-round event: makes the
            top {res.cfg.topCut || 1} in <strong>{formatPct(res.chosen.topCut / res.chosen.sims)}</strong> and wins{' '}
            <strong>{formatPct(res.chosen.wins / res.chosen.sims)}</strong> of {res.chosen.sims.toLocaleString()} simulations
            (baseline for an average deck: {formatPct((res.cfg.topCut || 1) / res.cfg.players)} and {formatPct(1 / res.cfg.players)}).
          </p>
          <p className="an-sub">
            Compared across legends: rates for every opponent seat sampled from the field over all simulations (n = seats).
          </p>
          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th>Legend</th>
                  <th className="an-num">Seats (n)</th>
                  <th className="an-num">P(top cut)</th>
                  <th className="an-num">P(win)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.legend} className={r.entries < 100 ? 'an-faded' : ''}>
                    <td>{short(r.legend)}</td>
                    <td className="an-num">{r.entries.toLocaleString()}</td>
                    <td className="an-num">
                      {formatPct(r.cut.p)} <span className="an-small">({formatPct(r.cut.low, 0)}–{formatPct(r.cut.high, 0)})</span>
                    </td>
                    <td className="an-num">
                      {formatPct(r.win.p, 2)} <span className="an-small">· {r.wins}/{r.entries}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
