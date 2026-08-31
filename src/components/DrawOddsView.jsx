import { useMemo, useState } from 'react'
import {
  pmf,
  atLeast,
  atMost,
  multivariate,
  mulliganPartialRedraw,
  mulliganFullRedraw,
  formatPercent,
} from '../probability/hypergeometric'
import './DrawOddsView.css'

function clampInt(value, lo, hi, fallback) {
  const n = parseInt(value, 10)
  if (Number.isNaN(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

function Bar({ p }) {
  return (
    <span className="odds-bar-track">
      <span className="odds-bar-fill" style={{ width: `${Math.min(100, p * 100)}%` }} />
    </span>
  )
}

export default function DrawOddsView() {
  const [N, setN] = useState(40)
  const [K, setK] = useState(3)
  const [handSize, setHandSize] = useState(4)
  const [turns, setTurns] = useState(0)
  const [k, setK2] = useState(1)
  const [redraw, setRedraw] = useState(2)

  // Combo (two-piece) inputs.
  const [comboA, setComboA] = useState(3)
  const [comboB, setComboB] = useState(3)

  const n = Math.min(N, handSize + turns)

  const single = useMemo(() => {
    try {
      const exact = pmf(N, K, n, k)
      const least = atLeast(N, K, n, k)
      const most = atMost(N, K, n, k)
      const table = []
      const top = Math.min(K, n)
      for (let i = 1; i <= top; i++) {
        table.push({ k: i, exact: pmf(N, K, n, i), least: atLeast(N, K, n, i) })
      }
      const partial = mulliganPartialRedraw({ N, K, handSize, redraw, k })
      const full = mulliganFullRedraw({ N, K, handSize, k, attempts: 2 })
      return { exact, least, most, table, partial, full, error: null }
    } catch (err) {
      return { error: err.message }
    }
  }, [N, K, n, k, handSize, redraw])

  const combo = useMemo(() => {
    try {
      if (comboA + comboB > N) return { error: 'Combo pieces exceed deck size.' }
      const both = multivariate(N, n, [
        { size: comboA, min: 1 },
        { size: comboB, min: 1 },
      ])
      const eitherA = atLeast(N, comboA, n, 1)
      const eitherB = atLeast(N, comboB, n, 1)
      return { both, eitherA, eitherB, error: null }
    } catch (err) {
      return { error: err.message }
    }
  }, [N, comboA, comboB, n])

  return (
    <section className="odds-view">
      <header className="odds-intro">
        <h1 className="odds-intro-title">Draw Odds Calculator</h1>
        <p className="odds-intro-text">
          Hypergeometric probabilities for drawing without replacement. Model your{' '}
          <strong>40-card main deck</strong> (or a 12-card rune deck), set how many copies of a
          target you run, and see the odds of hitting it in your opening hand and beyond — including
          mulligan math and two-piece combo chances.
        </p>
      </header>

      <div className="odds-grid">
        <article className="odds-card odds-controls">
          <h2>Parameters</h2>

          <label className="odds-field">
            <span>
              Deck size <b>N</b>
            </span>
            <input
              type="number"
              min={1}
              max={200}
              value={N}
              onChange={(e) => setN(clampInt(e.target.value, 1, 200, 40))}
            />
          </label>

          <label className="odds-field">
            <span>
              Copies in deck <b>K</b>: {K}
            </span>
            <input
              type="range"
              min={1}
              max={Math.min(12, N)}
              value={K}
              onChange={(e) => setK(clampInt(e.target.value, 1, N, 3))}
            />
          </label>

          <label className="odds-field">
            <span>
              Opening hand size: {handSize}
            </span>
            <input
              type="range"
              min={1}
              max={Math.min(15, N)}
              value={handSize}
              onChange={(e) => setHandSize(clampInt(e.target.value, 1, N, 4))}
            />
          </label>

          <label className="odds-field">
            <span>
              Extra draws (turns): {turns} <span className="odds-muted">→ n = {n}</span>
            </span>
            <input
              type="range"
              min={0}
              max={Math.min(20, N - handSize)}
              value={turns}
              onChange={(e) => setTurns(clampInt(e.target.value, 0, N, 0))}
            />
          </label>

          <label className="odds-field">
            <span>
              Desired copies <b>k</b>: {k}
            </span>
            <input
              type="range"
              min={1}
              max={Math.min(K, n)}
              value={k}
              onChange={(e) => setK2(clampInt(e.target.value, 1, Math.min(K, n), 1))}
            />
          </label>

          <label className="odds-field">
            <span>
              Mulligan: redraw up to {redraw} card{redraw !== 1 ? 's' : ''}
            </span>
            <input
              type="range"
              min={0}
              max={handSize}
              value={redraw}
              onChange={(e) => setRedraw(clampInt(e.target.value, 0, handSize, 2))}
            />
          </label>
        </article>

        <article className="odds-card odds-results">
          <h2>
            Drawing <b>{K}</b> copies in <b>{n}</b> cards from <b>{N}</b>
          </h2>
          {single.error ? (
            <div className="odds-error">{single.error}</div>
          ) : (
            <>
              <div className="odds-headline">
                <div className="odds-headline-stat">
                  <span className="odds-big">{formatPercent(single.least)}</span>
                  <span className="odds-label">
                    P(X &ge; {k}) — at least {k}
                  </span>
                </div>
                <div className="odds-headline-stat">
                  <span className="odds-big">{formatPercent(single.exact)}</span>
                  <span className="odds-label">P(X = {k}) — exactly {k}</span>
                </div>
                <div className="odds-headline-stat">
                  <span className="odds-big">{formatPercent(single.most)}</span>
                  <span className="odds-label">
                    P(X &le; {k}) — at most {k}
                  </span>
                </div>
              </div>

              <table className="odds-table">
                <thead>
                  <tr>
                    <th>Copies</th>
                    <th>Exactly</th>
                    <th>At least</th>
                    <th className="odds-th-bar">P(X &ge; k)</th>
                  </tr>
                </thead>
                <tbody>
                  {single.table.map((r) => (
                    <tr key={r.k} className={r.k === k ? 'odds-row-active' : ''}>
                      <td>{r.k}</td>
                      <td>{formatPercent(r.exact)}</td>
                      <td>{formatPercent(r.least)}</td>
                      <td>
                        <Bar p={r.least} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="odds-mulligan">
                <h3>Mulligan odds for P(X &ge; {k})</h3>
                <div className="odds-mull-row">
                  <span>Partial redraw (keep hits, swap {redraw})</span>
                  <b>{formatPercent(single.partial)}</b>
                </div>
                <div className="odds-mull-row">
                  <span>Full redraw (2 fresh hands)</span>
                  <b>{formatPercent(single.full)}</b>
                </div>
              </div>
            </>
          )}
        </article>

        <article className="odds-card odds-combo">
          <h2>Two-piece combo in opener</h2>
          <p className="odds-card-sub">
            Odds of drawing at least one of each combo piece in the same {n}-card draw.
          </p>
          <div className="odds-combo-inputs">
            <label className="odds-field">
              <span>Piece A copies: {comboA}</span>
              <input
                type="range"
                min={1}
                max={Math.min(12, N)}
                value={comboA}
                onChange={(e) => setComboA(clampInt(e.target.value, 1, N, 3))}
              />
            </label>
            <label className="odds-field">
              <span>Piece B copies: {comboB}</span>
              <input
                type="range"
                min={1}
                max={Math.min(12, N)}
                value={comboB}
                onChange={(e) => setComboB(clampInt(e.target.value, 1, N, 3))}
              />
            </label>
          </div>
          {combo.error ? (
            <div className="odds-error">{combo.error}</div>
          ) : (
            <div className="odds-combo-results">
              <div className="odds-headline-stat">
                <span className="odds-big">{formatPercent(combo.both)}</span>
                <span className="odds-label">Both pieces (A and B)</span>
              </div>
              <div className="odds-combo-sub">
                <span>&ge;1 Piece A: {formatPercent(combo.eitherA)}</span>
                <span>&ge;1 Piece B: {formatPercent(combo.eitherB)}</span>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  )
}
