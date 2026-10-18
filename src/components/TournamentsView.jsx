import { useMemo, useState } from 'react'
import { groupTournaments, countryFlagEmoji } from '../tournamentUtils'
import { eventCoverage, isLowCoverage, formatCoverage } from '../stats/coverage'
import DataSourceNote from './DataSourceNote'
import './TournamentsView.css'
import './Analytics.css'

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

export default function TournamentsView({ allDecks, onOpen, scope, onScopeChange, coverage: covProp }) {
  const [query, setQuery] = useState('')
  const coverage = useMemo(() => covProp || eventCoverage(allDecks), [covProp, allDecks])
  const minCoverage = scope?.minCoverage ?? 0

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
            see its full deck lists and a top-8 conversion breakdown by legend.{' '}
            <strong>Coverage</strong> = decks recorded ÷ players: riftdecks lists at most 64 decks per
            event and some events only publish their top cut. Events below the coverage threshold are
            left out of share and conversion stats, and their placement % is shown as approximate.
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

      {onScopeChange && (
        <div className="an-row" style={{ marginBottom: 12 }}>
          <label className="filter-group">
            <span className="filter-label">Exclude events below (share &amp; conversion stats)</span>
            <select
              className="filter-select"
              value={minCoverage}
              onChange={(e) => onScopeChange('minCoverage', Number(e.target.value))}
            >
              {[0, 0.25, 0.5, 0.75, 0.95].map((c) => (
                <option key={c} value={c}>
                  {c === 0 ? 'No minimum' : `${Math.round(c * 100)}% coverage`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <DataSourceNote
        dataset="placements"
        filters="all tracked events (last 45 days)"
        counts={`${tournaments.length} events · ${tournaments.filter((t) => isLowCoverage(coverage.get(t.key), minCoverage)).length} below ${Math.round(minCoverage * 100)}% coverage`}
      />

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
                  <th className="col-t-decks">Coverage</th>
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
                    <td className="col-t-decks">
                      {(() => {
                        const c = coverage.get(t.key)
                        const low = isLowCoverage(c, minCoverage)
                        return (
                          <span
                            className={low ? 'an-badge an-badge--warn' : ''}
                            title={
                              (c?.capped ? 'Deck list capped at 64 by the source. ' : '') +
                              (low ? 'Excluded from share & conversion stats; placement % is approximate.' : '')
                            }
                          >
                            {formatCoverage(c)}
                            {c?.capped ? ' · cap' : ''}
                          </span>
                        )
                      })()}
                    </td>
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
