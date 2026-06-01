import './DeckGrid.css'

const STANDING_COLORS = { 1: 'gold', 2: 'silver', 3: 'bronze' }

function standingLabel(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function formatDate(date) {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

export default function DeckGrid({ decks }) {
  if (!decks.length) return null

  return (
    <div className="deck-list-wrap">
      <table className="deck-list">
        <thead>
          <tr>
            <th className="col-standing">Place</th>
            <th className="col-legend">Legend</th>
            <th className="col-tournament">Tournament</th>
            <th className="col-players">Players</th>
            <th className="col-date">Date</th>
            <th className="col-price">Price</th>
            <th className="col-link"></th>
          </tr>
        </thead>
        <tbody>
          {decks.map((deck) => {
            const colorClass = STANDING_COLORS[deck.standing] ?? 'default'
            const url = `https://riftdecks.com${deck.deckUrl}`
            return (
              <tr key={deck.id} className="deck-row">
                <td className="col-standing">
                  <span className={`standing-badge standing-badge--${colorClass}`}>
                    {standingLabel(deck.standing)}
                  </span>
                </td>
                <td className="col-legend">{deck.legendName}</td>
                <td className="col-tournament" title={deck.tournamentName}>
                  {deck.tournamentName}
                </td>
                <td className="col-players">
                  {deck.totalPlayers != null ? deck.totalPlayers : '—'}
                </td>
                <td className="col-date">{formatDate(deck.tournamentDate)}</td>
                <td className="col-price">
                  {deck.price != null ? `$${deck.price.toFixed(2)}` : '—'}
                </td>
                <td className="col-link">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="deck-link-btn"
                  >
                    View ↗
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
