import { useMemo, useState } from 'react'
import { runSimulation } from '../simulation/goldfish'
import { parseDeckList, enrichDeckList } from '../simulation/deckImport'
import exampleDeck from '../../data/example-deck.json'
import './GoldfishView.css'

function clampInt(value, lo, hi, fallback) {
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function Bar({ pct }) {
  return (
    <span className="gf-bar-track">
      <span className="gf-bar-fill" style={{ width: `${Math.min(100, pct)}%` }} />
    </span>
  )
}

export default function GoldfishView() {
  const [iterations, setIterations] = useState(10000)
  const [turns, setTurns] = useState(4)
  const [handSize, setHandSize] = useState(4)
  const [powerPerTurn, setPowerPerTurn] = useState(2)
  const [minEarly, setMinEarly] = useState(1)
  const [t3Units, setT3Units] = useState(3)
  const [t4Units, setT4Units] = useState(4)
  const [deckText, setDeckText] = useState(JSON.stringify(exampleDeck, null, 2))
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(false)

  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState(null)

  const convertDeckList = async () => {
    const parsed = parseDeckList(importText)
    if (!parsed.mainDeck.length) {
      setImportStatus({ type: 'error', text: 'No MainDeck cards found. Check the section headings.' })
      return
    }
    setImporting(true)
    setImportStatus({ type: 'info', text: 'Resolving card costs from riftcodex…' })
    try {
      const { deckDef, unresolved } = await enrichDeckList(parsed, {
        onProgress: (done, total) =>
          setImportStatus({ type: 'info', text: `Resolving cards… ${done}/${total}` }),
      })
      setDeckText(JSON.stringify(deckDef, null, 2))
      setImportStatus({
        type: unresolved.length ? 'warn' : 'ok',
        text: unresolved.length
          ? `Loaded ${deckDef.meta.mainDeckSize} cards. Unresolved (synth cost): ${unresolved.join(', ')}`
          : `Loaded ${deckDef.meta.mainDeckSize}-card deck — all costs resolved. Hit Run.`,
      })
    } catch (err) {
      setImportStatus({ type: 'error', text: `Import failed: ${err.message}` })
    } finally {
      setImporting(false)
    }
  }

  const deck = useMemo(() => {
    try {
      const parsed = JSON.parse(deckText)
      if (!Array.isArray(parsed.cards)) throw new Error('Deck JSON must have a "cards" array.')
      return { deck: parsed, error: null }
    } catch (err) {
      return { deck: null, error: err.message }
    }
  }, [deckText])

  const run = () => {
    if (!deck.deck) return
    setRunning(true)
    setError(null)
    // Defer so the "Running…" state paints before the synchronous sim blocks.
    setTimeout(() => {
      try {
        const result = runSimulation(
          deck.deck,
          {
            iterations,
            turns,
            handSize,
            powerPerTurn,
            mulligan: { minEarlyCards: minEarly, earlyCostMin: 1, earlyCostMax: 2 },
            thresholds: [
              { name: 'units_by_t3', turn: 3, type: 'unit', count: t3Units },
              { name: 'units_by_t4', turn: 4, type: 'unit', count: t4Units },
            ],
          },
          { seed: (Math.random() * 2 ** 31) | 0 },
        )
        setReport(result)
      } catch (err) {
        setError(err.message)
        setReport(null)
      } finally {
        setRunning(false)
      }
    }, 20)
  }

  const m = report?.metrics
  const turnKeys = m ? Object.keys(m.curveEfficiencyByTurn) : []

  const curve = useMemo(() => {
    if (!deck.deck) return null
    const hist = {}
    for (const c of deck.deck.cards) hist[c.cost] = (hist[c.cost] || 0) + (c.count ?? 1)
    return Object.fromEntries(Object.entries(hist).sort((a, b) => a[0] - b[0]))
  }, [deck.deck])

  return (
    <section className="gf-view">
      <header className="gf-intro">
        <h1 className="gf-intro-title">Deck Consistency Simulator</h1>
        <p className="gf-intro-text">
          A headless Monte Carlo &ldquo;goldfish&rdquo; test: it draws thousands of opening hands,
          applies a mulligan heuristic, then walks turns 1&ndash;{turns} spending the resource pool
          to measure how reliably the deck curves out. Card energy costs come from the resolved deck
          JSON (built from the riftcodex API). Edit the deck or knobs and re-run.
        </p>
      </header>

      <div className="gf-layout">
        <div className="gf-controls">
          <div className="gf-field">
            <label>Iterations</label>
            <select value={iterations} onChange={(e) => setIterations(Number(e.target.value))}>
              {[1000, 5000, 10000, 25000, 50000].map((v) => (
                <option key={v} value={v}>
                  {v.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          <div className="gf-field">
            <label>Turns</label>
            <input
              type="number"
              min="1"
              max="12"
              value={turns}
              onChange={(e) => setTurns(clampInt(e.target.value, 1, 12, 4))}
            />
          </div>
          <div className="gf-field">
            <label>Hand size</label>
            <input
              type="number"
              min="1"
              max="10"
              value={handSize}
              onChange={(e) => setHandSize(clampInt(e.target.value, 1, 10, 4))}
            />
          </div>
          <div className="gf-field">
            <label>Runes / turn</label>
            <input
              type="number"
              min="1"
              max="6"
              value={powerPerTurn}
              onChange={(e) => setPowerPerTurn(clampInt(e.target.value, 1, 6, 2))}
            />
          </div>
          <div className="gf-field">
            <label>Mull. min early (1&ndash;2 cost)</label>
            <input
              type="number"
              min="0"
              max="5"
              value={minEarly}
              onChange={(e) => setMinEarly(clampInt(e.target.value, 0, 5, 1))}
            />
          </div>
          <div className="gf-field">
            <label>Units by T3 target</label>
            <input
              type="number"
              min="1"
              max="10"
              value={t3Units}
              onChange={(e) => setT3Units(clampInt(e.target.value, 1, 10, 3))}
            />
          </div>
          <div className="gf-field">
            <label>Units by T4 target</label>
            <input
              type="number"
              min="1"
              max="10"
              value={t4Units}
              onChange={(e) => setT4Units(clampInt(e.target.value, 1, 10, 4))}
            />
          </div>
          <button type="button" className="gf-run" onClick={run} disabled={running || !deck.deck}>
            {running ? 'Running…' : `Run ${iterations.toLocaleString()} games`}
          </button>
          {deck.error && <div className="gf-error">Deck JSON error: {deck.error}</div>}
          {error && <div className="gf-error">Simulation error: {error}</div>}
        </div>

        <div className="gf-results">
          {!report ? (
            <div className="gf-placeholder">Run the simulation to see consistency metrics.</div>
          ) : (
            <>
              <div className="gf-headline">
                <div className="gf-stat">
                  <span className="gf-stat-num">{m.brickRate}%</span>
                  <span className="gf-stat-label">Brick rate (no T1/T2 play)</span>
                </div>
                <div className="gf-stat">
                  <span className="gf-stat-num">{m.curveEfficiency}%</span>
                  <span className="gf-stat-label">Curve efficiency (T1&ndash;T{turns})</span>
                </div>
                <div className="gf-stat">
                  <span className="gf-stat-num">{m.avgMulligans}</span>
                  <span className="gf-stat-label">Avg mulligans</span>
                </div>
              </div>

              <h2 className="gf-section-title">Per-turn breakdown</h2>
              <table className="gf-table">
                <thead>
                  <tr>
                    <th>Turn</th>
                    <th>Curve efficiency</th>
                    <th className="gf-num">Whiff %</th>
                    <th className="gf-num">Avg cards</th>
                    <th className="gf-num">Avg float</th>
                  </tr>
                </thead>
                <tbody>
                  {turnKeys.map((t) => (
                    <tr key={t}>
                      <td>T{t}</td>
                      <td>
                        <div className="gf-bar-cell">
                          <Bar pct={m.curveEfficiencyByTurn[t]} />
                          <span className="gf-bar-value">{m.curveEfficiencyByTurn[t]}%</span>
                        </div>
                      </td>
                      <td className="gf-num">{m.turnWhiffRate[t]}%</td>
                      <td className="gf-num">{m.avgCardsPlayedByTurn[t]}</td>
                      <td className="gf-num">{m.avgFloatByTurn[t]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 className="gf-section-title">Turn-N consistency</h2>
              <ul className="gf-thresholds">
                {Object.entries(m.thresholds).map(([name, th]) => (
                  <li key={name} className="gf-threshold">
                    <span className="gf-threshold-desc">{th.description}</span>
                    <Bar pct={th.probability} />
                    <span className="gf-bar-value">{th.probability}%</span>
                  </li>
                ))}
              </ul>

              <div className="gf-meta-line">
                {report.deck.title} · curve {JSON.stringify(curve)} ·{' '}
                {report.config.iterations.toLocaleString()} games · {report.performance.runtimeMs}ms
              </div>
            </>
          )}
        </div>
      </div>

      <details className="gf-deck-editor" open>
        <summary>Import decklist (paste text)</summary>
        <p className="gf-import-hint">
          Paste the plain-text export with <code>Legend:</code>, <code>MainDeck:</code>,{' '}
          <code>Rune Pool:</code> and <code>Sideboard:</code> sections. Card costs are resolved live
          from the riftcodex API; only the main deck feeds the simulation.
        </p>
        <textarea
          className="gf-deck-text gf-import-text"
          value={importText}
          spellCheck={false}
          placeholder={'Legend:\n1 Reksai, Void Burrower\n\nMainDeck:\n3 Cleave\n3 Noxus Hopeful\n...\n\nRune Pool:\n7 Fury Rune\n5 Order Rune'}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div className="gf-import-actions">
          <button
            type="button"
            className="gf-run gf-import-btn"
            onClick={convertDeckList}
            disabled={importing || !importText.trim()}
          >
            {importing ? 'Converting…' : 'Convert & load'}
          </button>
          {importStatus && (
            <span className={`gf-import-status gf-import-status--${importStatus.type}`}>
              {importStatus.text}
            </span>
          )}
        </div>
      </details>

      <details className="gf-deck-editor">
        <summary>Deck definition (JSON)</summary>
        <textarea
          className="gf-deck-text"
          value={deckText}
          spellCheck={false}
          onChange={(e) => setDeckText(e.target.value)}
        />
      </details>
    </section>
  )
}
