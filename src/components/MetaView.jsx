import { useMemo } from 'react'
import LineChart from './LineChart'
import './MetaView.css'

const fmtPct = (v) => `${(v * 100).toFixed(1)}%`
const fmtMoney = (v) => `$${Math.round(v)}`

function BarList({ rows, max, valueLabel }) {
  if (!rows.length) return <div className="chart-empty">Not enough data.</div>
  return (
    <ul className="meta-bars">
      {rows.map((r) => (
        <li key={r.name} className="meta-bar-row">
          <span className="meta-bar-name" title={r.name}>{r.name}</span>
          <span className="meta-bar-track">
            <span className="meta-bar-fill" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="meta-bar-value">{valueLabel(r)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function MetaView({ allDecks }) {
  const stats = useMemo(() => {
    const total = allDecks.length
    const byLegend = new Map()

    for (const d of allDecks) {
      const key = d.legendName || 'Unknown'
      if (!byLegend.has(key)) {
        byLegend.set(key, { name: key, count: 0, firsts: 0 })
      }
      const e = byLegend.get(key)
      e.count += 1
      if (d.standing === 1) e.firsts += 1
    }

    const legends = [...byLegend.values()]

    const popularity = [...legends]
      .sort((a, b) => b.count - a.count)
      .slice(0, 15)
      .map((l) => ({ name: l.name, value: l.count, pct: l.count / (total || 1) }))

    const winRate = legends
      .filter((l) => l.count >= 10)
      .map((l) => ({ name: l.name, value: l.firsts / l.count, count: l.count, firsts: l.firsts }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15)

    const byDay = new Map()
    for (const d of allDecks) {
      if (!d.tournamentDate || d.price == null) continue
      const key = d.tournamentDate.toISOString().slice(0, 10)
      if (!byDay.has(key)) byDay.set(key, { sum: 0, n: 0 })
      const e = byDay.get(key)
      e.sum += d.price
      e.n += 1
    }
    const trend = [...byDay.entries()]
      .map(([day, e]) => ({
        x: new Date(day + 'T00:00:00Z').getTime(),
        y: e.sum / e.n,
        label: day,
      }))
      .sort((a, b) => a.x - b.x)

    return { total, uniqueLegends: legends.length, popularity, winRate, trend }
  }, [allDecks])

  const popMax = stats.popularity[0]?.value || 1
  const winMax = stats.winRate[0]?.value || 1

  const formatTrendDate = (label) =>
    new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })

  return (
    <section className="meta-view">
      <div className="meta-summary">
        <div className="meta-stat">
          <span className="meta-stat-num">{stats.total.toLocaleString()}</span>
          <span className="meta-stat-label">Decks tracked</span>
        </div>
        <div className="meta-stat">
          <span className="meta-stat-num">{stats.uniqueLegends}</span>
          <span className="meta-stat-label">Unique legends</span>
        </div>
      </div>

      <div className="meta-grid">
        <article className="meta-card">
          <h2>Legend popularity</h2>
          <p className="meta-card-sub">Share of all tracked tournament decks (top 15).</p>
          <BarList
            rows={stats.popularity}
            max={popMax}
            valueLabel={(r) => `${r.value} · ${fmtPct(r.pct)}`}
          />
        </article>

        <article className="meta-card">
          <h2>1st-place rate by legend</h2>
          <p className="meta-card-sub">
            Share of each legend&apos;s decks that placed 1st (min. 10 decks). Based on tournament
            placements, not head-to-head match results.
          </p>
          <BarList
            rows={stats.winRate}
            max={winMax}
            valueLabel={(r) => `${fmtPct(r.value)} (${r.firsts}/${r.count})`}
          />
        </article>

        <article className="meta-card meta-card--wide">
          <h2>Average deck price over time</h2>
          <p className="meta-card-sub">Mean price of decks per tournament day.</p>
          <LineChart
            data={stats.trend}
            formatY={fmtMoney}
            formatX={formatTrendDate}
          />
        </article>
      </div>
    </section>
  )
}
