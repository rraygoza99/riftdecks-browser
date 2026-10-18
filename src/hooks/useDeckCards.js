import { useState, useEffect } from 'react'
import { parseDeckCards } from '../analytics/cardAnalysis'

// Module-level cache: the export is fetched and parsed once per session.
let cachedPromise = null

function fetchDeckCards() {
  if (!cachedPromise) {
    cachedPromise = fetch(`/deck-cards.json?d=${new Date().toISOString().slice(0, 10)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((raw) => parseDeckCards(raw))
      .catch((err) => {
        cachedPromise = null
        throw err
      })
  }
  return cachedPromise
}

/**
 * Per-deck card lists: { info: Map, lists: Map<deckId, DeckList>, generatedAt }.
 * `data` stays null while loading or when the export is missing.
 */
export default function useDeckCards() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchDeckCards()
      .then((d) => active && setData(d))
      .catch((err) => active && setError(`Card lists unavailable: ${err.message}`))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  return { data, loading, error }
}
