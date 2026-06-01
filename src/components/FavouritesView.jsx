import './FavouritesView.css'

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

function StarFilled() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
      <path d="M3.612 15.443c-.386.198-.824-.149-.746-.592l.83-4.73L.173 6.765c-.329-.314-.158-.888.283-.95l4.898-.696L7.538.792c.197-.39.73-.39.927 0l2.184 4.327 4.898.696c.441.062.612.636.282.95l-3.522 3.356.83 4.73c.078.443-.36.79-.746.592L8 13.187l-4.389 2.256z"/>
    </svg>
  )
}

export default function FavouritesView({ allDecks, favourites, onToggleFavourite }) {
  // Filter decks to only favourites
  const favDecks = allDecks.filter((d) => favourites.has(d.deckUrl))

  // Group by legend name
  const groups = []
  const seen = new Map()
  for (const deck of favDecks) {
    const key = deck.legendName
    if (!seen.has(key)) {
      seen.set(key, [])
      groups.push({ legendName: key, decks: seen.get(key) })
    }
    seen.get(key).push(deck)
  }
  groups.sort((a, b) => a.legendName.localeCompare(b.legendName))

  if (!favDecks.length) {
    return (
      <div className="fav-empty">
        <p>No favourite decks yet.</p>
        <p className="fav-empty__hint">Click the ★ next to any deck to save it here.</p>
      </div>
    )
  }

  return (
    <div className="fav-view">
      <p className="fav-count">{favDecks.length} favourite deck{favDecks.length !== 1 ? 's' : ''}</p>
      {groups.map((group) => (
        <section key={group.legendName} className="fav-group">
          <h2 className="fav-group__legend">{group.legendName}</h2>
          <div className="fav-list-wrap">
            <table className="fav-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Place</th>
                  <th>Tournament</th>
                  <th>Players</th>
                  <th>Date</th>
                  <th>Price</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.decks.map((deck) => {
                  const url = `https://riftdecks.com${deck.deckUrl}`
                  return (
                    <tr key={deck.deckUrl} className="fav-row">
                      <td className="fav-col-star">
                        <button
                          className="fav-btn fav-btn--active"
                          onClick={() => onToggleFavourite(deck.deckUrl)}
                          title="Remove from favourites"
                          aria-label="Remove from favourites"
                          type="button"
                        >
                          <StarFilled />
                        </button>
                      </td>
                      <td>{standingLabel(deck.standing)}</td>
                      <td className="fav-col-tournament" title={deck.tournamentName}>
                        {deck.tournamentName}
                      </td>
                      <td className="fav-col-right">
                        {deck.totalPlayers != null ? deck.totalPlayers : '—'}
                      </td>
                      <td className="fav-col-nowrap">{formatDate(deck.tournamentDate)}</td>
                      <td className="fav-col-nowrap">
                        {deck.price != null ? `$${deck.price.toFixed(2)}` : '—'}
                      </td>
                      <td className="fav-col-link">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fav-deck-link"
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
        </section>
      ))}
    </div>
  )
}
