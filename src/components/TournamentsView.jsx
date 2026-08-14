import { useMemo, useState } from 'react'
import { groupTournaments, countryFlagEmoji } from '../tournamentUtils'
import './TournamentsView.css'

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

export default function TournamentsView({ allDecks, onOpen }) {
  const [query, setQuery] = useState('')

  const tournaments = useMemo(() => {
    const list = groupTournaments(allDecks)
    const q = query.trim().toLowerCase()
    const filtered = q
      ? list.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            (t.country || '').toLowerCase().includes(q)
        )
      : list
    return filtered.sort((a, b) => {
      const dt = (b.date?.getTime?.() ?? 0) - (a.date?.getTime?.() ?? 0)
      return dt !== 0 ? dt : a.name.localeCompare(b.name)
    })
  }, [allDecks, query])

  return (
    <section className="tournaments-view">
      <div className="tournaments-head">
        <div>
          <h2 className="tournaments-title">Tournaments</h2>
          <p className="tournaments-sub">
            Every tracked tournament with its date, size and host country. Open one to
            see its full deck lists and a top-8 conversion breakdown by legend.
          </p>
        </div>
        <input
          className="tournaments-search"
          type="search"
          placeholder="Search tournaments…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {tournaments.length === 0 ? (
        <div className="app-status">No tournaments match your search.</div>
      ) : (
        <>
          <div className="tournaments-count">
            {tournaments.length} tournament{tournaments.length !== 1 ? 's' : ''}
          </div>
          <div className="tournaments-table-wrap">
            <table className="tournaments-table">
              <thead>
                <tr>
                  <th className="col-t-date">Date</th>
                  <th className="col-t-name">Tournament</th>
                  <th className="col-t-players">Players</th>
                  <th className="col-t-country">Country</th>
                  <th className="col-t-decks">Decks</th>
                  <th className="col-t-arrow"></th>
                </tr>
              </thead>
              <tbody>
                {tournaments.map((t) => (
                  <tr
                    key={t.key}
                    className="tournament-row"
                    onClick={() => onOpen(t.key)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpen(t.key)
                      }
                    }}
                  >
                    <td className="col-t-date">{formatDate(t.date)}</td>
                    <td className="col-t-name" title={t.name}>
                      {t.name}
                      {t.metaSet && <span className="tournament-meta-tag">{t.metaSet}</span>}
                    </td>
                    <td className="col-t-players">{t.players != null ? t.players : '—'}</td>
                    <td className="col-t-country">
                      {t.country ? (
                        <span className="tournament-country">
                          <span className="tournament-flag" aria-hidden="true">
                            {countryFlagEmoji(t.country)}
                          </span>
                          {t.country}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="col-t-decks">{t.decks.length}</td>
                    <td className="col-t-arrow" aria-hidden="true">›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
