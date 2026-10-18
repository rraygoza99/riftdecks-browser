import { useState } from 'react'
import './LineChart.css'
import './Analytics.css'

// Validated categorical order (see dataviz palette): fixed slots, never cycled.
export const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6']
export const MAX_SERIES = SERIES_VARS.length

/**
 * Multi-series line chart with a shared y-axis, crosshair tooltip, legend and
 * end-of-line direct labels.
 * @param {string[]} xLabels           category labels (e.g. week starts)
 * @param {{ name, color, values: (number|null)[], counts?: string[] }[]} series
 */
export default function MultiLineChart({ xLabels, series, height = 240, formatY = (v) => v, formatX = (v) => v }) {
  const [hover, setHover] = useState(null)
  if (!xLabels.length || !series.length) return <div className="chart-empty">No data available.</div>

  const width = 680
  const padL = 46
  const padR = 110
  const padT = 12
  const padB = 28
  const all = series.flatMap((s) => s.values.filter((v) => v != null))
  const maxY = Math.max(...all, 0) * 1.1 || 1
  const sx = (i) => padL + (xLabels.length === 1 ? 0.5 : i / (xLabels.length - 1)) * (width - padL - padR)
  const sy = (y) => height - padB - (y / maxY) * (height - padT - padB)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width
    let best = 0
    for (let i = 1; i < xLabels.length; i++) if (Math.abs(sx(i) - x) < Math.abs(sx(best) - x)) best = i
    setHover(best)
  }

  // Direct labels at line ends, nudged apart so they don't collide.
  const ends = series
    .map((s) => {
      let i = s.values.length - 1
      while (i >= 0 && s.values[i] == null) i--
      return { name: s.name, color: s.color, y: i >= 0 ? sy(s.values[i]) : null }
    })
    .filter((e) => e.y != null)
    .sort((a, b) => a.y - b.y)
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 12) ends[i].y = ends[i - 1].y + 12

  return (
    <div className="mlc">
      <div className="mlc-legend">
        {series.map((s) => (
          <span key={s.name} className="mlc-legend-item">
            <span className="an-legend-dot" style={{ background: `var(${s.color})` }} />
            {s.name}
          </span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          className="line-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Line chart"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line className="line-chart-grid" x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} />
              <text className="line-chart-axis" x={padL - 8} y={sy(t) + 4} textAnchor="end">
                {formatY(t)}
              </text>
            </g>
          ))}
          {xLabels.map((l, i) =>
            i === 0 || i === xLabels.length - 1 || i === Math.floor(xLabels.length / 2) ? (
              <text key={l} className="line-chart-axis" x={sx(i)} y={height - 8} textAnchor="middle">
                {formatX(l)}
              </text>
            ) : null
          )}
          {hover != null && <line className="line-chart-grid" x1={sx(hover)} x2={sx(hover)} y1={padT} y2={height - padB} style={{ strokeDasharray: '3 3' }} />}
          {series.map((s) => {
            const pts = s.values.map((v, i) => (v == null ? null : `${sx(i)},${sy(v)}`)).filter(Boolean).join(' ')
            return (
              <g key={s.name}>
                <polyline points={pts} fill="none" stroke={`var(${s.color})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) =>
                  v == null ? null : (
                    <circle key={i} cx={sx(i)} cy={sy(v)} r={hover === i ? 4.5 : 3} fill={`var(${s.color})`} stroke="var(--bg-card)" strokeWidth="2" />
                  )
                )}
              </g>
            )
          })}
          {ends.map((e) => (
            <text key={e.name} x={width - padR + 8} y={e.y + 4} className="line-chart-axis" style={{ fill: 'var(--text-secondary)' }}>
              {e.name.length > 14 ? `${e.name.slice(0, 13)}…` : e.name}
            </text>
          ))}
        </svg>
        {hover != null && (
          <div className="mlc-tip" style={{ left: `${(sx(hover) / width) * 100}%` }}>
            <div className="mlc-tip-title">{formatX(xLabels[hover])}</div>
            {series.map((s) => (
              <div key={s.name} className="mlc-tip-row">
                <span className="an-legend-dot" style={{ background: `var(${s.color})` }} />
                <span>{s.name}</span>
                <strong>{s.values[hover] == null ? '—' : formatY(s.values[hover])}</strong>
                {s.counts?.[hover] && <span className="an-small">{s.counts[hover]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
