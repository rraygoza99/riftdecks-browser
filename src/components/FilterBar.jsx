import './FilterBar.css'

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

      {/* Legend filter */}
      <div className="filter-group">
        <label className="filter-label" htmlFor="legend-select">
          Legend
        </label>
        <select
          id="legend-select"
          className="filter-select"
          value={filters.legend}
          onChange={(e) => onFilterChange('legend', e.target.value)}
        >
          <option value="">All legends</option>
          {legendOptions.map((opt) => (
            <option key={opt.name} value={opt.name}>
              {opt.name}
            </option>
          ))}
        </select>
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
    </div>
  )
}
