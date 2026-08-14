import { useMemo } from 'react'
import DeckGrid from './DeckGrid'
import { groupTournaments, countryFlagEmoji } from '../tournamentUtils'
import './TournamentDetail.css'

function formatDate(date) {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function TournamentDetail({
  allDecks,
  tournamentKey,
  isFavourite,
  onToggleFavourite,
  onBack,
  onBackToList,
}) {
  const tournament = useMemo(
    () => groupTournaments(allDecks).find((t) => t.key === tournamentKey) || null,
    [allDecks, tournamentKey]
  )

  // Top-8 conversion: for each legend that placed in the top 8, what share of
  // that legend's entries in this tournament actually reached the top 8.
  const conversion = useMemo(() => {
    if (!tournament) return []
    const byLegend = new Map()
    for (const d of tournament.decks) {
      const key = d.legendName || 'Unknown'
      let e = byLegend.get(key)
      if (!e) {
        e = { legend: key, total: 0, top8: 0, best: Infinity, tileUrl: d.legendTileUrl }
        byLegend.set(key, e)
      }
      e.total += 1
      if (d.standing <= 8) e.top8 += 1
      if (d.standing < e.best) e.best = d.standing
    }
    return [...byLegend.values()]
      .filter((e) => e.top8 > 0)
      .map((e) => ({ ...e, pct: (e.top8 / e.total) * 100 }))
      .sort((a, b) => b.pct - a.pct || b.top8 - a.top8 || a.best - b.best)
  }, [tournament])

  const sortedDecks = useMemo(() => {
    if (!tournament) return []
    return [...tournament.decks].sort((a, b) => {
      if (a.standing !== b.standing) return a.standing - b.standing
      return (a.legendName || '').localeCompare(b.legendName || '')
    })
  }, [tournament])

  if (!tournament) {
    return (
      <section className="tournament-detail">
        <button type="button" className="td-back" onClick={onBackToList}>
          ← All tournaments
        </button>
        <div className="app-status">Tournament not found.</div>
      </section>
    )
  }

  return (
    <section className="tournament-detail">
      <div className="td-nav">
        <button type="button" className="td-back" onClick={onBackToList}>
          ← All tournaments
        </button>
        <button type="button" className="td-back td-back--home" onClick={onBack}>
          Home
        </button>
      </div>

      <header className="td-header">
        <h2 className="td-title">{tournament.name}</h2>
        <div className="td-meta">
          <span className="td-meta-item">{formatDate(tournament.date)}</span>
          <span className="td-meta-sep">·</span>
          <span className="td-meta-item">
            {tournament.players != null ? tournament.players : tournament.decks.length} players
          </span>
          {tournament.country && (
            <>
              <span className="td-meta-sep">·</span>
              <span className="td-meta-item">
                <span className="td-flag" aria-hidden="true">
                  {countryFlagEmoji(tournament.country)}
                </span>
                {tournament.country}
              </span>
            </>
          )}
          {tournament.metaSet && (
            <>
              <span className="td-meta-sep">·</span>
              <span className="td-meta-tag">{tournament.metaSet}</span>
            </>
          )}
        </div>
      </header>

      <section className="td-section">
        <h3 className="td-section-title">Top 8 conversion analysis</h3>
        <p className="td-section-sub">
          For each legend that reached the top 8, the share of that legend's entries in
          this tournament that made the cut.
        </p>
        {conversion.length === 0 ? (
          <div className="app-status">No top-8 data available for this tournament.</div>
        ) : (
          <div className="td-conv-wrap">
            <table className="td-conv-table">
              <thead>
                <tr>
                  <th className="td-conv-legend">Legend</th>
                  <th className="td-conv-num">Top 8</th>
                  <th className="td-conv-num">Entries</th>
                  <th className="td-conv-rate">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {conversion.map((e) => (
                  <tr key={e.legend}>
                    <td className="td-conv-legend">
                      {e.tileUrl && (
                        <span
                          className="td-conv-tile"
                          style={{ backgroundImage: `url(${e.tileUrl})` }}
                          aria-hidden="true"
                        />
                      )}
                      {e.legend}
                    </td>
                    <td className="td-conv-num">{e.top8}</td>
                    <td className="td-conv-num">{e.total}</td>
                    <td className="td-conv-rate">
                      <span className="td-conv-bar">
                        <span
                          className="td-conv-bar-fill"
                          style={{ width: `${e.pct}%` }}
                        />
                      </span>
                      <span className="td-conv-pct">{e.pct.toFixed(0)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="td-section">
        <h3 className="td-section-title">
          Deck lists <span className="td-section-count">{sortedDecks.length}</span>
        </h3>
        <DeckGrid
          decks={sortedDecks}
          isFavourite={isFavourite}
          onToggleFavourite={onToggleFavourite}
        />
      </section>
    </section>
  )
}
