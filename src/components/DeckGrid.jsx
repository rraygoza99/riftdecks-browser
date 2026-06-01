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

// Star icons as inline SVG (Bootstrap Icons: BsStar / BsStarFill)
function StarIcon({ filled, onClick, title }) {
  return (
    <button
      className={`fav-btn${filled ? ' fav-btn--active' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      title={title}
      aria-label={title}
      type="button"
    >
      {filled ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M2.866 14.85c-.078.444.36.791.746.593l4.39-2.256 4.389 2.256c.386.198.824-.149.746-.592l-.83-4.73 3.522-3.356c.33-.314.16-.888-.282-.95l-4.898-.696L8.465.792a.513.513 0 0 0-.927 0L5.354 5.12l-4.898.696c-.441.062-.612.636-.283.95l3.523 3.356-.83 4.73zm4.905-2.767-3.686 1.894.694-3.957a.565.565 0 0 0-.163-.505L1.71 6.745l4.052-.576a.525.525 0 0 0 .393-.288L8 2.223l1.847 3.658a.525.525 0 0 0 .393.288l4.052.575-2.906 2.77a.565.565 0 0 0-.163.506l.694 3.957-3.686-1.894a.503.503 0 0 0-.461 0z"/>
        </svg>
      )}
    </button>
  )
}

export default function DeckGrid({ decks, isFavourite, onToggleFavourite }) {
  if (!decks.length) return null

  return (
    <div className="deck-list-wrap">
      <table className="deck-list">
        <thead>
          <tr>
            <th className="col-fav"></th>
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
                <td className="col-fav">
                  <StarIcon
                    filled={isFavourite(deck.deckUrl)}
                    onClick={() => onToggleFavourite(deck.deckUrl)}
                    title={isFavourite(deck.deckUrl) ? 'Remove from favourites' : 'Add to favourites'}
                  />
                </td>
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
