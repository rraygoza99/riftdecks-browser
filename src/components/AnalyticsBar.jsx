import './FilterBar.css'
import './Analytics.css'
import MultiSelect from './MultiSelect'
import { REGIONS } from '../data/regions'

const DATE_OPTIONS = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
]

const COVERAGE_OPTIONS = [0, 0.25, 0.5, 0.75, 0.95]

/**
 * Shared filter bar for analytics pages. Reads/writes the same scope object
 * as the deck browser so a filter set on one page carries to the others.
 * `show` limits which controls render (e.g. Meta Targeting has no dates).
 */
export default function AnalyticsBar({
  scope,
  onScopeChange,
  legendOptions = [],
  metaOptions = [],
  show = ['dateRange', 'meta', 'region', 'legends', 'minCoverage'],
  children,
}) {
  const has = (k) => show.includes(k)
  return (
    <div className="filter-bar an-bar">
      {has('dateRange') && (
        <div className="filter-group">
          <span className="filter-label">Date range</span>
          <div className="filter-seg">
            {DATE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`seg-btn ${scope.dateRange === o.value ? 'seg-btn--active' : ''}`}
                onClick={() => onScopeChange('dateRange', o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {has('meta') && metaOptions.length > 0 && (
        <label className="filter-group">
          <span className="filter-label">Meta</span>
          <select className="filter-select" value={scope.meta ?? 'all'} onChange={(e) => onScopeChange('meta', e.target.value)}>
            <option value="all">All metas</option>
            {metaOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      {has('region') && (
        <label className="filter-group">
          <span className="filter-label">Region</span>
          <select className="filter-select" value={scope.region || 'all'} onChange={(e) => onScopeChange('region', e.target.value)}>
            <option value="all">All regions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      )}
      {has('legends') && (
        <div className="filter-group">
          <span className="filter-label">Legend</span>
          <MultiSelect
            options={legendOptions.map((o) => o.name)}
            selected={scope.legends}
            onChange={(v) => onScopeChange('legends', v)}
            placeholder="All legends"
          />
        </div>
      )}
      {has('maxPlacement') && (
        <label className="filter-group">
          <span className="filter-label">Placement</span>
          <select
            className="filter-select"
            value={scope.maxPlacement}
            onChange={(e) => onScopeChange('maxPlacement', Number(e.target.value))}
          >
            <option value={0}>Any placement</option>
            <option value={1}>Winner only</option>
            <option value={4}>Top 4</option>
            <option value={8}>Top 8</option>
            <option value={16}>Top 16</option>
            <option value={32}>Top 32</option>
          </select>
        </label>
      )}
      {has('minCoverage') && (
        <label className="filter-group" title="Coverage = decks recorded ÷ players. Low-coverage events only list their top finishers, which skews share and conversion stats.">
          <span className="filter-label">Exclude events below</span>
          <select
            className="filter-select"
            value={scope.minCoverage}
            onChange={(e) => onScopeChange('minCoverage', Number(e.target.value))}
          >
            {COVERAGE_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c === 0 ? 'No minimum' : `${Math.round(c * 100)}% coverage`}
              </option>
            ))}
          </select>
        </label>
      )}
      {children}
    </div>
  )
}

/** Numeric "min. sample" control used by ranking views. */
export function MinSampleControl({ value, onChange, options = [1, 5, 10, 20, 50], label = 'Min. sample' }) {
  return (
    <div className="filter-group">
      <span className="filter-label">{label}</span>
      <div className="filter-seg">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={`seg-btn ${value === n ? 'seg-btn--active' : ''}`}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}
