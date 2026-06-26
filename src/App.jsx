import { useState, useEffect, useMemo } from 'react'
import './App.css'
import FilterBar from './components/FilterBar'
import DeckGrid from './components/DeckGrid'
import Pagination from './components/Pagination'
import FavouritesView from './components/FavouritesView'
import AdSlot from './components/AdSlot'
import useFavourites from './hooks/useFavourites'

const RELEVANCE_LABELS = { 0: 'All Events', 1: 'Local / Casual', 2: 'Competitive' }

const DATE_RANGES = { '7d': 7, '30d': 30, '90d': 90, all: null }

export default function App() {
  const [allDecks, setAllDecks] = useState([])
  const [scrapedAt, setScrapedAt] = useState(null)
  const [relevanceLabel, setRelevanceLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [view, setView] = useState('main') // 'main' | 'favourites'
  const { favourites, toggleFavourite, isFavourite } = useFavourites()

  const [filters, setFilters] = useState({
    legends: [],
    dateRange: '30d',
    maxPlacement: 0,
    maxPrice: 0,
    sortBy: 'date',
  })

  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)

  // Load static JSON produced by the scrape script
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/decks.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data) => {
        // Parse tournament dates into Date objects
        const decks = (data.decks || []).map((d) => ({
          ...d,
          tournamentDate: d.tournamentDate ? new Date(d.tournamentDate + 'T00:00:00Z') : null,
          details: null,
        }))
        setAllDecks(decks)
        setScrapedAt(data.scrapedAt ? new Date(data.scrapedAt) : null)
        setRelevanceLabel(RELEVANCE_LABELS[data.relevance] ?? '')
      })
      .catch((err) => {
        setError(
          err.message.includes('404') || err.message.includes('HTTP 4')
            ? 'No data file found. Run "npm run scrape" first to fetch tournament data.'
            : `Failed to load data: ${err.message}`
        )
      })
      .finally(() => setLoading(false))
  }, [])

  // Unique legend options from loaded data — deduplicate by display name
  const legendOptions = useMemo(() => {
    const seen = new Set()
    const result = []
    for (const d of allDecks) {
      if (d.legendName && !seen.has(d.legendName)) {
        seen.add(d.legendName)
        result.push({ name: d.legendName })
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [allDecks])

  // Max price in dataset (for slider ceiling)
  const maxPriceInData = useMemo(
    () => Math.ceil(Math.max(0, ...allDecks.map((d) => d.price ?? 0))),
    [allDecks]
  )

  // Filtered + sorted deck list
  const filteredDecks = useMemo(() => {
    let result = [...allDecks]

    if (filters.legends.length) {
      result = result.filter((d) => filters.legends.includes(d.legendName))
    }

    if (filters.dateRange !== 'all') {
      const days = DATE_RANGES[filters.dateRange]
      if (days) {
        const cutoff = new Date(Date.now() - days * 86_400_000)
        result = result.filter((d) => d.tournamentDate && d.tournamentDate >= cutoff)
      }
    }

    if (filters.maxPlacement > 0) {
      result = result.filter((d) => d.standing <= filters.maxPlacement)
    }

    if (filters.maxPrice > 0) {
      result = result.filter((d) => d.price != null && d.price <= filters.maxPrice)
    }

    if (filters.sortBy === 'date') {
      result.sort((a, b) => {
        const dt = (b.tournamentDate?.getTime() ?? 0) - (a.tournamentDate?.getTime() ?? 0)
        return dt !== 0 ? dt : a.standing - b.standing
      })
    } else if (filters.sortBy === 'placement') {
      result.sort((a, b) => {
        if (a.standing !== b.standing) return a.standing - b.standing
        return (b.tournamentDate?.getTime() ?? 0) - (a.tournamentDate?.getTime() ?? 0)
      })
    } else if (filters.sortBy === 'price') {
      result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
    }

    return result
  }, [allDecks, filters])

  // Reset to the first page whenever the filters or page size change
  useEffect(() => {
    setCurrentPage(1)
  }, [filters, pageSize])

  // Current page slice
  const paginatedDecks = useMemo(
    () => filteredDecks.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredDecks, currentPage, pageSize]
  )

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const scrapedAtStr = scrapedAt
    ? scrapedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="app">
      <header className="app-header">
        <img
          className="app-logo"
          src="https://riftdecks.com/img/logo4.png"
          alt="RiftDecks logo"
          onError={(e) => (e.target.style.display = 'none')}
        />
        <div>
          <h1>RiftDecks Browser</h1>
          <div className="app-header-sub">
            {scrapedAtStr
              ? `${relevanceLabel} tournaments · data from ${scrapedAtStr}`
              : 'Top tournament decks from riftdecks.com'}
          </div>
        </div>
        <div className="app-header-actions">
          <button
            className={`fav-nav-btn${view === 'favourites' ? ' fav-nav-btn--active' : ''}`}
            onClick={() => setView((v) => v === 'favourites' ? 'main' : 'favourites')}
            title="Favourite decks"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
              <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>
            </svg>
            Favourites
            {favourites.size > 0 && (
              <span className="fav-nav-badge">{favourites.size}</span>
            )}
          </button>
        </div>
      </header>

      {view === 'favourites' ? (
        <FavouritesView
          allDecks={allDecks}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
        />
      ) : (
        <>
          {!loading && !error && (
            <FilterBar
              filters={filters}
              onFilterChange={handleFilterChange}
              legendOptions={legendOptions}
              maxPriceInData={maxPriceInData}
            />
          )}

          {loading && <div className="app-status">Loading data…</div>}
          {error && <div className="app-status app-status--error">{error}</div>}

          {!loading && !error && (
            <>
              {filteredDecks.length > 0 && (
                <div className="deck-count">
                  Showing {filteredDecks.length} deck{filteredDecks.length !== 1 ? 's' : ''}
                  {allDecks.length !== filteredDecks.length ? ` (filtered from ${allDecks.length})` : ''}
                </div>
              )}

              <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_TOP} />

              <DeckGrid
                decks={paginatedDecks}
                isFavourite={isFavourite}
                onToggleFavourite={toggleFavourite}
              />

              {filteredDecks.length > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredDecks.length}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={setPageSize}
                />
              )}

              {filteredDecks.length > 0 && (
                <AdSlot slot={import.meta.env.VITE_ADSENSE_SLOT_BOTTOM} />
              )}

              {!filteredDecks.length && (
                <div className="app-status">
                  No decks match the current filters.{' '}
                  {filters.dateRange !== 'all' && 'Try expanding the date range.'}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
