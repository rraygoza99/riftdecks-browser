import { useMemo, useState } from 'react'
import useLegendCards from '../hooks/useLegendCards'
import './LegendsView.css'

export default function LegendsView({ onOpen }) {
  const { data, loading, error } = useLegendCards()
  const [query, setQuery] = useState('')

  const legends = useMemo(() => {
    const list = data?.legends || []
    const q = query.trim().toLowerCase()
    const filtered = q ? list.filter((l) => l.legendName.toLowerCase().includes(q)) : list
    return [...filtered].sort((a, b) => b.totalDecks - a.totalDecks)
  }, [data, query])

  if (loading) return <div className="app-status">Loading card analysis…</div>
  if (error) return <div className="app-status app-status--error">{error}</div>

  return (
    <section className="legends-view">
      <div className="legends-head">
        <div>
          <h2 className="legends-title">Legend card analysis</h2>
          <p className="legends-sub">
            The most-played cards for each legend, aggregated from a sample of its top-8
            tournament decks. Open a legend to see which cards are staples, which are flexible
            choices, and how many copies winning lists typically run. Choose a legend below to
            dive in.
          </p>
        </div>
        <input
          className="legends-search"
          type="search"
          placeholder="Search legends…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {legends.length === 0 ? (
        <div className="app-status">No legends match your search.</div>
      ) : (
        <div className="legends-grid">
          {legends.map((l) => (
            <button
              key={l.legendSlug}
              type="button"
              className="legend-tile"
              onClick={() => onOpen(l.legendSlug)}
            >
              {l.legendTileUrl ? (
                <span
                  className="legend-tile-img"
                  style={{ backgroundImage: `url(${l.legendTileUrl})` }}
                  aria-hidden="true"
                />
              ) : (
                <span className="legend-tile-img legend-tile-img--empty" aria-hidden="true" />
              )}
              <span className="legend-tile-body">
                <span className="legend-tile-name">{l.legendName}</span>
                <span className="legend-tile-meta">
                  {l.totalDecks} deck{l.totalDecks !== 1 ? 's' : ''} · {l.cards.length} cards
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
