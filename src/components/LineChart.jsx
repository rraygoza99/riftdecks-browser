import './LineChart.css'

/**
 * Minimal responsive SVG line/area chart.
 * @param {{x:number, y:number, label:string}[]} data - sorted ascending by x.
 */
export default function LineChart({ data, height = 220, formatY = (v) => v, formatX = (v) => v }) {
  if (!data || data.length === 0) {
    return <div className="chart-empty">No data available.</div>
  }

  const width = 640
  const padL = 52
  const padR = 14
  const padT = 14
  const padB = 30

  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const maxY = Math.max(...ys) * 1.1 || 1

  const sx = (x) => padL + ((x - minX) / (maxX - minX || 1)) * (width - padL - padR)
  const sy = (y) => height - padB - (y / maxY) * (height - padT - padB)

  const linePts = data.map((d) => `${sx(d.x)},${sy(d.y)}`).join(' ')
  const areaPts = `${sx(data[0].x)},${height - padB} ${linePts} ${sx(data[data.length - 1].x)},${height - padB}`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
  const firstLabel = data[0].label
  const midLabel = data[Math.floor(data.length / 2)].label
  const lastLabel = data[data.length - 1].label

  return (
    <svg
      className="line-chart"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Line chart"
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            className="line-chart-grid"
            x1={padL}
            x2={width - padR}
            y1={sy(t)}
            y2={sy(t)}
          />
          <text className="line-chart-axis" x={padL - 8} y={sy(t) + 4} textAnchor="end">
            {formatY(t)}
          </text>
        </g>
      ))}

      <polygon className="line-chart-area" points={areaPts} />
      <polyline className="line-chart-line" points={linePts} />

      {data.length <= 40 &&
        data.map((d, i) => (
          <circle key={i} className="line-chart-dot" cx={sx(d.x)} cy={sy(d.y)} r={2.5}>
            <title>{`${formatX(d.label)}: ${formatY(d.y)}`}</title>
          </circle>
        ))}

      <text className="line-chart-axis" x={padL} y={height - 8} textAnchor="start">
        {formatX(firstLabel)}
      </text>
      <text className="line-chart-axis" x={(padL + width - padR) / 2} y={height - 8} textAnchor="middle">
        {formatX(midLabel)}
      </text>
      <text className="line-chart-axis" x={width - padR} y={height - 8} textAnchor="end">
        {formatX(lastLabel)}
      </text>
    </svg>
  )
}
