import { useState } from 'react'
import './DeckCard.css'

const STANDING_COLORS = {
  1: 'gold',
  2: 'silver',
  3: 'bronze',
}

function standingLabel(n) {
  if (n === 1) return '1st'
  if (n === 2) return '2nd'
  if (n === 3) return '3rd'
  return `${n}th`
}

function formatDate(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function isoDate(date) {
  if (!date) return null
  if (date instanceof Date) return date.toISOString().slice(0, 10)
  return String(date).slice(0, 10)
}

// Assemble a clean, portable JSON snapshot of a deck's known metadata.
function buildDeckJson(deck) {
  return {
    id: deck.deckId ?? deck.id ?? null,
    deckName: deck.deckName ?? null,
    legendName: deck.legendName ?? null,
    legendSlug: deck.legendSlug ?? null,
    standing: deck.standing ?? null,
    price: deck.price ?? null,
    tournamentName: deck.tournamentName ?? null,
    tournamentDate: isoDate(deck.tournamentDate),
    tournamentCountry: deck.tournamentCountry ?? null,
    totalPlayers: deck.totalPlayers ?? null,
    meta: deck.meta ?? null,
    metaSet: deck.metaSet ?? null,
    legendTileUrl: deck.legendTileUrl ?? null,
    deckUrl: deck.deckUrl ? `https://riftdecks.com${deck.deckUrl}` : null,
  }
}

export default function DeckCard({ deck }) {
  const [copied, setCopied] = useState(false)

  const imgUrl = deck.deckId
    ? `https://riftdecks.com/images/deck/${deck.deckId}`
    : deck.legendTileUrl || null

  const riftdecksUrl = `https://riftdecks.com${deck.deckUrl}`
  const colorClass = STANDING_COLORS[deck.standing] ?? 'default'

  const copyJson = async () => {
    try {
      const json = JSON.stringify(buildDeckJson(deck), null, 2)
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <article className="deck-card">
      {/* Deck preview image */}
      <div className="deck-card__thumb">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={deck.legendName}
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none'
              e.target.nextElementSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <div className="deck-card__thumb-fallback" style={{ display: imgUrl ? 'none' : 'flex' }}>
          <span>{deck.legendName.slice(0, 2).toUpperCase()}</span>
        </div>

        {/* Placement badge */}
        <span className={`deck-card__standing deck-card__standing--${colorClass}`}>
          {standingLabel(deck.standing)}
        </span>
      </div>

      {/* Info */}
      <div className="deck-card__body">
        <h3 className="deck-card__legend">{deck.legendName}</h3>
        {deck.deckName && deck.deckName !== deck.legendName && (
          <p className="deck-card__deck-name">{deck.deckName}</p>
        )}
        <p className="deck-card__tournament" title={deck.tournamentName}>
          {deck.tournamentName}
        </p>
        <p className="deck-card__date">{formatDate(deck.tournamentDate)}</p>

        {deck.price != null && (
          <p className="deck-card__price">${deck.price.toFixed(2)}</p>
        )}
      </div>

      {/* Footer */}
      <div className="deck-card__footer">
        <a
          href={riftdecksUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="deck-card__link deck-card__link--primary"
        >
          View on RiftDecks ↗
        </a>
        <button
          type="button"
          className="deck-card__btn deck-card__btn--ghost deck-card__btn--copy"
          onClick={copyJson}
          title="Copy deck JSON to clipboard"
        >
          {copied ? 'Copied!' : 'Copy JSON'}
        </button>
      </div>
    </article>
  )
}
