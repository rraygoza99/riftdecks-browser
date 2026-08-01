import './FilterBar.css'
import MultiSelect from './MultiSelect'

const DATE_OPTIONS = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
]

const PLACEMENT_OPTIONS = [
  { value: 0, label: 'Any placement' },
  { value: 1, label: 'Winner only' },
  { value: 4, label: 'Top 4' },
  { value: 8, label: 'Top 8' },
  { value: 16, label: 'Top 16' },
  { value: 32, label: 'Top 32' },
]

const SORT_OPTIONS = [
  { value: 'date', label: 'Most recent' },
  { value: 'placement', label: 'Best placement' },
  { value: 'price', label: 'Lowest price' },
]

export default function FilterBar({
  filters,
  onFilterChange,
  legendOptions,
  metaOptions = [],
  maxPriceInData,
}) {
  const priceMax = maxPriceInData || 2000

  return (
    <div className="filter-bar">
      {/* Date range */}
      <div className="filter-group">
        <label className="filter-label">Date range</label>
        <div className="filter-seg">
          {DATE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`seg-btn ${filters.dateRange === opt.value ? 'seg-btn--active' : ''}`}
              onClick={() => onFilterChange('dateRange', opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Meta / set */}
      {metaOptions.length > 0 && (
        <div className="filter-group">
          <label className="filter-label" htmlFor="meta-select">
            Meta
          </label>
          <select
            id="meta-select"
            className="filter-select"
            value={filters.meta}
            onChange={(e) => onFilterChange('meta', e.target.value)}
          >
            <option value="all">All metas</option>
            {metaOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Legend filter */}
      <div className="filter-group">
        <label className="filter-label">Legend</label>
        <MultiSelect
          options={legendOptions.map((opt) => opt.name)}
          selected={filters.legends}
          onChange={(values) => onFilterChange('legends', values)}
          placeholder="All legends"
        />
      </div>

      {/* Max placement */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="placement-select">
          Placement
        </label>
        <select
          id="placement-select"
          className="filter-select"
          value={filters.maxPlacement}
          onChange={(e) => onFilterChange('maxPlacement', Number(e.target.value))}
        >
          {PLACEMENT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Max price */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="price-range">
          Max price{filters.maxPrice > 0 ? `: $${filters.maxPrice}` : ': any'}
        </label>
        <input
          id="price-range"
          type="range"
          className="filter-range"
          min={0}
          max={priceMax}
          step={25}
          value={filters.maxPrice}
          onChange={(e) => onFilterChange('maxPrice', Number(e.target.value))}
        />
      </div>

      {/* Sort */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="sort-select">
          Sort by
        </label>
        <select
          id="sort-select"
          className="filter-select"
          value={filters.sortBy}
          onChange={(e) => onFilterChange('sortBy', e.target.value)}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Best per legend */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="best-per-legend">
          Show
        </label>
        <label className="filter-toggle" htmlFor="best-per-legend">
          <input
            id="best-per-legend"
            type="checkbox"
            checked={filters.bestPerLegend}
            onChange={(e) => onFilterChange('bestPerLegend', e.target.checked)}
          />
          <span>Best deck per legend</span>
        </label>
      </div>
    </div>
  )
}
