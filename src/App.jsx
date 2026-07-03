import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import './App.css'
import FilterBar from './components/FilterBar'
import DeckGrid from './components/DeckGrid'
import Pagination from './components/Pagination'
import FavouritesView from './components/FavouritesView'
import PrivacyPolicy from './components/PrivacyPolicy'
import MetaView from './components/MetaView'
import LegendsView from './components/LegendsView'
import LegendAnalysis from './components/LegendAnalysis'
import AboutView from './components/AboutView'
import ContactView from './components/ContactView'
import AdSlot from './components/AdSlot'
import useFavourites from './hooks/useFavourites'
import useTheme from './hooks/useTheme'

const RELEVANCE_LABELS = { 0: 'All Events', 1: 'Local / Casual', 2: 'Competitive' }

const DATE_RANGES = { '7d': 7, '30d': 30, '90d': 90, all: null }

const PATH_TO_VIEW = {
  '/': 'main',
  '/meta': 'meta',
  '/legends': 'legends',
  '/favourites': 'favourites',
  '/privacy': 'privacy',
  '/about': 'about',
  '/contact': 'contact',
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const legendSlug = location.pathname.startsWith('/legend/')
    ? decodeURIComponent(location.pathname.slice('/legend/'.length))
    : null
  const view = legendSlug ? 'legend' : (PATH_TO_VIEW[location.pathname] ?? 'main')
  const goTo = (target) => navigate(target === 'main' ? '/' : `/${target}`)

  const [allDecks, setAllDecks] = useState([])
  const [scrapedAt, setScrapedAt] = useState(null)
  const [relevanceLabel, setRelevanceLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { favourites, toggleFavourite, isFavourite, importFavourites } = useFavourites()
  const { theme, toggleTheme } = useTheme()

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
    fetch(`/decks.json?d=${new Date().toISOString().slice(0, 10)}`)
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
        <button
          type="button"
          className="app-brand"
          onClick={() => goTo('main')}
          title="Back to home"
          aria-label="Back to home"
        >
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
        </button>
        <div className="app-header-actions">
          {view !== 'main' && (
            <button
              className="fav-nav-btn"
              onClick={() => goTo('main')}
              title="Back to home"
              type="button"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
                <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
              </svg>
              Home
            </button>
          )}
          <button
            className={`fav-nav-btn${view === 'meta' ? ' fav-nav-btn--active' : ''}`}
            onClick={() => goTo(view === 'meta' ? 'main' : 'meta')}
            title="Meta dashboard"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
              <path d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07z"/>
            </svg>
            Meta
          </button>
          <button
            className={`fav-nav-btn${view === 'legends' || view === 'legend' ? ' fav-nav-btn--active' : ''}`}
            onClick={() => goTo(view === 'legends' || view === 'legend' ? 'main' : 'legends')}
            title="Legend card analysis"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
              <path d="M3.5 2A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 12.5 2h-9zM3 3.5a.5.5 0 0 1 .5-.5H8v10H3.5a.5.5 0 0 1-.5-.5v-9zM9 13V3h3.5a.5.5 0 0 1 .5.5v9a.5.5 0 0 1-.5.5H9z"/>
            </svg>
            Legends
          </button>
          <button
            className={`fav-nav-btn${view === 'favourites' ? ' fav-nav-btn--active' : ''}`}
            onClick={() => goTo(view === 'favourites' ? 'main' : 'favourites')}
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
          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            type="button"
          >
            {theme === 'dark' ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M8 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 1a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {view === 'favourites' ? (
        <FavouritesView
          allDecks={allDecks}
          favourites={favourites}
          onToggleFavourite={toggleFavourite}
          onImport={importFavourites}
        />
      ) : view === 'meta' ? (
        <MetaView allDecks={allDecks} />
      ) : view === 'legends' ? (
        <LegendsView onOpen={(slug) => goTo(`legend/${slug}`)} />
      ) : view === 'legend' ? (
        <LegendAnalysis
          slug={legendSlug}
          onBack={() => goTo('main')}
          onBackToList={() => goTo('legends')}
        />
      ) : view === 'privacy' ? (
        <PrivacyPolicy onBack={() => goTo('main')} />
      ) : view === 'about' ? (
        <AboutView onBack={() => goTo('main')} />
      ) : view === 'contact' ? (
        <ContactView onBack={() => goTo('main')} />
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

      <footer className="app-footer">
        <div className="footer-links">
          <button type="button" className="footer-link" onClick={() => goTo('about')}>
            About
          </button>
          <span className="footer-sep">·</span>
          <button type="button" className="footer-link" onClick={() => goTo('contact')}>
            Contact
          </button>
          <span className="footer-sep">·</span>
          <button type="button" className="footer-link" onClick={() => goTo('privacy')}>
            Privacy Policy
          </button>
          <span className="footer-sep">·</span>
          <span>
            Deck data from{' '}
            <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
              riftdecks.com
            </a>
          </span>
        </div>
        <p className="footer-disclaimer">
          This is an unofficial, fan-made site for informational purposes only. It is
          not affiliated with, endorsed by, or associated with{' '}
          <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
            riftDecks.com
          </a>{' '}
          or Riot Games. All deck data is publicly sourced and belongs to its
          respective owners.
        </p>
      </footer>
    </div>
  )
}
