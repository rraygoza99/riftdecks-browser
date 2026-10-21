import { Fragment, useEffect, useMemo, useState } from 'react'
import { rankCandidates, fieldFromMatrix, DEFAULT_PRIOR_MATCHES } from '../analytics/matchups'
import { formatPct, wilsonInterval } from '../stats/stats'
import DataSourceNote from './DataSourceNote'
import MultiSelect from './MultiSelect'
import winrateData from '../../data/winrate-matrix.json'
import './FilterBar.css'
import './MetaView.css'
import './Analytics.css'

const LS_KEY = 'riftdecks_field_simulator'
const MATRIX = winrateData.matrix
const LEGENDS = (winrateData.legends || []).map((l) => l.name).sort((a, b) => a.localeCompare(b))
const GLOBAL = fieldFromMatrix(winrateData)
const BY_PRESENCE = [...GLOBAL.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
const short = (name) => (name || '').split(',')[0]
const DEFAULT_EVENT = { players: 32, rounds: 5, topCut: 8, sims: 1000 }

function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
    return s && typeof s === 'object' ? s : {}
  } catch {
    return {}
  }
}

// Colour a winrate cell: green favoured, red unfavoured, faint when thin.
function wrStyle(p, n) {
  if (p == null) return {}
  const conf = n / (n + 50)
  const color = p >= 0.5 ? '80, 200, 128' : '224, 80, 80'
  return { background: `rgba(${color}, ${(0.1 + 0.6 * Math.min(1, Math.abs(p - 0.5) * 5)) * conf})` }
}

/**
 * Field Simulator: list the legends you expect to face (with how many of
 * each), and see which legend has the best winrate against exactly that field.
 */
export default function FieldSimulatorView() {
  const saved = useMemo(loadSaved, [])
  // Opponents: legend -> expected count (relative weight).
  const [opponents, setOpponents] = useState(() =>
    saved.opponents && typeof saved.opponents === 'object'
      ? Object.fromEntries(Object.entries(saved.opponents).filter(([k]) => LEGENDS.includes(k)))
      : Object.fromEntries(BY_PRESENCE.slice(0, 6).map((l) => [l, 1]))
  )
  const [event, setEvent] = useState({ ...DEFAULT_EVENT, ...(saved.event || {}) })
  const [prior, setPrior] = useState(DEFAULT_PRIOR_MATCHES)
  const [onlyField, setOnlyField] = useState(false)
  const [simRows, setSimRows] = useState(null)
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ opponents, event }))
    } catch {
      // Storage unavailable — the field just won't be remembered.
    }
  }, [opponents, event])

  const field = useMemo(() => new Map(Object.entries(opponents).filter(([, w]) => w > 0)), [opponents])
  const totalWeight = [...field.values()].reduce((a, b) => a + b, 0)
  const candidates = onlyField ? [...field.keys()] : LEGENDS

  const rows = useMemo(
    () => (field.size ? rankCandidates(MATRIX, candidates, field, { priorStrength: prior }) : []),
    [field, candidates.join('|'), prior]
  )
  // Simulation results are stale once the inputs change.
  useEffect(() => setSimRows(null), [field, prior, event, onlyField])

  const runSim = () => {
    setRunning(true)
    setTimeout(() => {
      // Simulate the 10 best candidates by expected winrate.
      const top = rows.slice(0, 10).map((r) => r.legend)
      const sim = rankCandidates(MATRIX, top, field, { priorStrength: prior, event: { ...event, seed: (Math.random() * 2 ** 31) | 0 } })
      setSimRows(new Map(sim.map((r) => [r.legend, r.sim])))
      setRunning(false)
    }, 20)
  }

  const setSelected = (names) =>
    setOpponents((prev) => Object.fromEntries(names.map((n) => [n, prev[n] ?? 1])))
  const setWeight = (name, w) => setOpponents((prev) => ({ ...prev, [name]: Math.max(0, w) }))
  const preset = (n) => setOpponents(Object.fromEntries(BY_PRESENCE.slice(0, n).map((l) => [l, Math.round(GLOBAL.get(l) * 1000) / 10])))
  const setEv = (k, v, lo, hi) => setEvent((prev) => ({ ...prev, [k]: Math.max(lo, Math.min(hi, Number(v) || lo)) }))

  const best = rows[0]

  return (
    <section className="meta-view">
      <header className="meta-intro">
        <h1 className="meta-intro-title">Field Simulator</h1>
        <p className="meta-intro-text">
          Tell it who you expect to face — the legends your opponents will play and roughly how many of each — and it ranks
          every legend by its winrate against exactly that field. Then simulate a Swiss event to see each pick&apos;s chance of
          making the top cut and winning.
        </p>
      </header>

      <DataSourceNote
        dataset="matches"
        filters={`${winrateData.metagame} · ${(winrateData.source?.dateRange || '').replace(/_/g, ' ')}`}
        counts={`${(winrateData.matchesAnalyzed || 0).toLocaleString()} matches · ${LEGENDS.length} legends`}
        extra="Matchup winrates come from riftDecks head-to-head data for that metagame; legends or sets it doesn't cover (e.g. brand-new Radiance cards) can't be modelled yet."
      />

      <div className="an-card">
        <h2>1. Your expected opponents</h2>
        <p className="an-sub">
          Pick the legends you expect, then set how many of each (relative: 3 Kennen + 1 Rengar means three times as many
          Kennen). Your field is saved in this browser.
        </p>
        <div className="an-row" style={{ marginBottom: 12 }}>
          <div className="filter-group">
            <span className="filter-label">Opponent legends</span>
            <MultiSelect options={LEGENDS} selected={Object.keys(opponents)} onChange={setSelected} placeholder="Choose legends" />
          </div>
          <div className="filter-group">
            <span className="filter-label">Quick fill (global presence)</span>
            <div className="filter-seg">
              {[4, 8, 12].map((n) => (
                <button key={n} type="button" className="seg-btn" onClick={() => preset(n)}>
                  Top {n}
                </button>
              ))}
              <button type="button" className="seg-btn" onClick={() => setOpponents({})}>
                Clear
              </button>
            </div>
          </div>
        </div>
        {field.size === 0 ? (
          <div className="an-empty">Add at least one opponent legend.</div>
        ) : (
          <div className="an-slider-grid">
            {Object.entries(opponents).map(([name, w]) => (
              <div key={name} className="an-slider-row" style={{ gridTemplateColumns: '1fr 70px 64px 20px' }}>
                <span title={name}>{short(name)}</span>
                <input
                  className="an-input"
                  style={{ width: 64 }}
                  type="number"
                  min="0"
                  step="1"
                  value={w}
                  onChange={(e) => setWeight(name, Number(e.target.value))}
                  aria-label={`Expected number of ${short(name)} opponents`}
                />
                <span className="an-num an-small">{totalWeight ? formatPct(w / totalWeight, 0) : '—'}</span>
                <button type="button" className="an-btn an-btn--ghost" style={{ padding: '0 4px' }} onClick={() => setSelected(Object.keys(opponents).filter((k) => k !== name))} aria-label={`Remove ${short(name)}`}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {best && (
        <div className="an-card">
          <h2>2. Best picks against this field</h2>
          <p className="an-sub">
            Expected winrate = Σ (opponent share × matchup winrate); a mirror counts as 50%. Matchups are shrunk toward 50% by
            a prior worth {prior} matches so thin samples don&apos;t dominate, and the band is the 95% range from matchup sample
            sizes. Click a row for its matchup-by-matchup breakdown.
          </p>
          <div className="an-row" style={{ marginBottom: 12 }}>
            <div className="filter-group">
              <span className="filter-label">Candidates</span>
              <div className="filter-seg">
                <button type="button" className={`seg-btn ${!onlyField ? 'seg-btn--active' : ''}`} onClick={() => setOnlyField(false)}>
                  All legends
                </button>
                <button type="button" className={`seg-btn ${onlyField ? 'seg-btn--active' : ''}`} onClick={() => setOnlyField(true)}>
                  Only the field
                </button>
              </div>
            </div>
            <div className="filter-group">
              <span className="filter-label">Shrinkage prior</span>
              <div className="filter-seg">
                {[0, 10, 20, 50].map((n) => (
                  <button key={n} type="button" className={`seg-btn ${prior === n ? 'seg-btn--active' : ''}`} onClick={() => setPrior(n)}>
                    {n === 0 ? 'none' : n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p style={{ margin: '0 0 12px' }}>
            Best pick: <strong>{short(best.legend)}</strong> at <strong>{formatPct(best.ewr)}</strong> expected winrate (
            {formatPct(best.low, 0)}–{formatPct(best.high, 0)}).
            {rows[1] && best.low <= rows[1].high
              ? ` Its band overlaps ${short(rows[1].legend)} (${formatPct(rows[1].ewr)}), so treat the top picks as close.`
              : ''}
          </p>

          <div className="an-card" style={{ background: 'var(--bg-secondary)' }}>
            <h3>3. Simulate the event</h3>
            <p className="an-sub">
              Swiss rounds with opponents drawn from your field, then a single-elimination top cut. Runs for the 10 best picks.
              Assumes no player-skill differences, no draws and random tiebreaks.
            </p>
            <div className="an-row">
              {[
                ['players', 'Players', 4, 1024],
                ['rounds', 'Rounds', 1, 15],
                ['topCut', 'Top cut', 0, 64],
              ].map(([k, l, lo, hi]) => (
                <label key={k} className="filter-group">
                  <span className="filter-label">{l}</span>
                  <input className="an-input" type="number" min={lo} max={hi} value={event[k]} onChange={(e) => setEv(k, e.target.value, lo, hi)} />
                </label>
              ))}
              <label className="filter-group">
                <span className="filter-label">Simulations</span>
                <select className="filter-select" value={event.sims} onChange={(e) => setEv('sims', e.target.value, 100, 10000)}>
                  {[300, 1000, 3000].map((n) => (
                    <option key={n} value={n}>
                      {n.toLocaleString()}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="an-btn" disabled={running} onClick={runSim}>
                {running ? 'Simulating…' : 'Run simulation'}
              </button>
            </div>
          </div>

          <div className="an-table-wrap">
            <table className="an-table">
              <thead>
                <tr>
                  <th className="an-num">#</th>
                  <th>Legend</th>
                  <th className="an-num">Expected WR (95%)</th>
                  <th>Best matchup</th>
                  <th>Worst matchup</th>
                  <th className="an-num">Field with data</th>
                  {simRows && <th className="an-num">P(top {event.topCut || 1})</th>}
                  {simRows && <th className="an-num">P(win)</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const sim = simRows?.get(r.legend)
                  const cut = sim ? wilsonInterval(sim.topCut, sim.sims) : null
                  return (
                    <Fragment key={r.legend}>
                      <tr
                        className={r.coveredShare < 0.5 ? 'an-faded' : ''}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setOpen(open === r.legend ? null : r.legend)}
                        title={r.coveredShare < 0.5 ? 'Most of this field has no head-to-head data for this legend' : 'Show matchups'}
                      >
                        <td className="an-num">{i + 1}</td>
                        <td>
                          {open === r.legend ? '▾ ' : '▸ '}
                          {short(r.legend)}
                        </td>
                        <td className="an-num">
                          <strong>{formatPct(r.ewr)}</strong>{' '}
                          <span className="an-small">
                            ({formatPct(r.low, 0)}–{formatPct(r.high, 0)})
                          </span>
                        </td>
                        <td>{r.best ? `${short(r.best.opponent)} ${formatPct(r.best.p, 0)}` : '—'}</td>
                        <td>{r.worst ? `${short(r.worst.opponent)} ${formatPct(r.worst.p, 0)}` : '—'}</td>
                        <td className="an-num">{formatPct(r.coveredShare, 0)}</td>
                        {simRows && (
                          <td className="an-num" title={cut ? `95% CI ${formatPct(cut.low, 0)}–${formatPct(cut.high, 0)}` : ''}>
                            {sim ? formatPct(sim.topCut / sim.sims) : <span className="an-muted">—</span>}
                          </td>
                        )}
                        {simRows && (
                          <td className="an-num">
                            {sim ? (
                              <>
                                {formatPct(sim.wins / sim.sims)} <span className="an-small">· {sim.wins}/{sim.sims}</span>
                              </>
                            ) : (
                              <span className="an-muted">—</span>
                            )}
                          </td>
                        )}
                      </tr>
                      {open === r.legend && (
                        <tr>
                          <td />
                          <td colSpan={simRows ? 7 : 5}>
                            <table className="an-table">
                              <thead>
                                <tr>
                                  <th>Opponent</th>
                                  <th className="an-num">Share of field</th>
                                  <th className="an-num">Winrate (shrunk)</th>
                                  <th className="an-num">Raw · matches</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.matchups.map((m) => (
                                  <tr key={m.opponent}>
                                    <td>{short(m.opponent)}</td>
                                    <td className="an-num">{formatPct(m.share, 0)}</td>
                                    <td className="an-num" style={m.mirror ? {} : wrStyle(m.p, m.n)}>
                                      {m.mirror ? 'mirror · 50%' : formatPct(m.p)}
                                    </td>
                                    <td className="an-num">{m.mirror ? '—' : m.n ? `${formatPct(m.raw)} · ${m.n}` : 'no data'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {simRows && (
            <p className="an-small" style={{ marginTop: 8 }}>
              Baseline for an average deck: {formatPct((event.topCut || 1) / event.players)} top cut, {formatPct(1 / event.players)} win.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
