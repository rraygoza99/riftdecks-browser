import { useMemo, useState } from 'react'
import AnalyticsBar from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import { applyScope, describeScope } from '../data/scope'
import { legendSlug } from '../tournamentUtils'
import './LegendsView.css'
import './Analytics.css'

export default function LegendsView({ allDecks, scope, onScopeChange, legendOptions, metaOptions, coverage, deckCards, onOpen }) {
  const [query, setQuery] = useState('')
  const lists = deckCards?.data?.lists

  const decks = useMemo(
    () => applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage }),
    [allDecks, scope, coverage]
  )

  // Every legend in scope is listed (same set as Meta); card-list coverage is
  // shown per legend instead of hiding legends without card data.
  const legends = useMemo(() => {
    const map = new Map()
    for (const d of decks) {
      const name = d.legendName || 'Unknown'
      let e = map.get(name)
      if (!e) map.set(name, (e = { name, slug: legendSlug(name), tile: d.legendTileUrl, decks: 0, withCards: 0 }))
      e.decks += 1
      if (lists?.has(String(d.deckId))) e.withCards += 1
      if (!e.tile && d.legendTileUrl) e.tile = d.legendTileUrl
    }
    const q = query.trim().toLowerCase()
    return [...map.values()]
      .filter((l) => !q || l.name.toLowerCase().includes(q))
      .sort((a, b) => b.decks - a.decks || a.name.localeCompare(b.name))
  }, [decks, lists, query])

  const totalWithCards = legends.reduce((s, l) => s + l.withCards, 0)

  return (
    <section className="legends-view">
      <div className="legends-head">
        <div>
          <h2 className="legends-title">Legend card analysis</h2>
          <p className="legends-sub">
            Open a legend to see which cards are staples, which are winner&apos;s tech, how many copies
            winning lists run, the main variants, and a generated consensus list. Card stats use every
            deck in scope that has a scraped card list; the count is shown on each tile.
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

      <AnalyticsBar
        scope={scope}
        onScopeChange={onScopeChange}
        legendOptions={legendOptions}
        metaOptions={metaOptions}
        show={['dateRange', 'meta', 'region', 'minCoverage']}
      />

      <DataSourceNote
        dataset="placements"
        filters={describeScope(scope, { skip: ['maxPrice', 'maxPlacePct', 'maxPlacement', 'legends'] })}
        counts={`${decks.length.toLocaleString()} decks · ${legends.length} legends · ${totalWithCards} decks with card lists`}
        extra={
          deckCards?.loading
            ? 'Loading card lists…'
            : deckCards?.error
              ? deckCards.error
              : 'Card lists are scraped from deck pages and only exist for part of the data.'
        }
      />

      {legends.length === 0 ? (
        <div className="app-status">No legends match your search.</div>
      ) : (
        <div className="legends-grid">
          {legends.map((l) => (
            <button key={l.slug} type="button" className="legend-tile" onClick={() => onOpen(l.slug)}>
              {l.tile ? (
                <span className="legend-tile-img" style={{ backgroundImage: `url(${l.tile})` }} aria-hidden="true" />
              ) : (
                <span className="legend-tile-img legend-tile-img--empty" aria-hidden="true" />
              )}
              <span className="legend-tile-body">
                <span className="legend-tile-name">{l.name}</span>
                <span className="legend-tile-meta">
                  {l.decks} deck{l.decks !== 1 ? 's' : ''} · {l.withCards} with card lists
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
