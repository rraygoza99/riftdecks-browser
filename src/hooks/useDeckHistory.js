import { useState, useCallback } from 'react'

const LS_KEY = 'riftdecks_history'

function uid() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(decks) {
  localStorage.setItem(LS_KEY, JSON.stringify(decks))
}

// Persistent, local-only record of the user's own decks and their match results.
// Each deck: { id, name, legend, cards, createdAt, matches: [] }
// Each match: { id, opponent, yourGames, oppGames, result: 'win'|'loss'|'draw', notes, date }
export default function useDeckHistory() {
  const [decks, setDecks] = useState(load)

  const persist = useCallback((updater) => {
    setDecks((prev) => {
      const next = updater(prev)
      save(next)
      return next
    })
  }, [])

  const addDeck = useCallback(
    ({ name, legend = '', cards = '' }) => {
      const deck = {
        id: uid(),
        name: name.trim() || 'Untitled deck',
        legend: legend.trim(),
        cards,
        createdAt: Date.now(),
        matches: [],
      }
      persist((prev) => [deck, ...prev])
      return deck
    },
    [persist]
  )

  const updateDeck = useCallback(
    (id, patch) => {
      persist((prev) =>
        prev.map((d) => (d.id === id ? { ...d, ...patch } : d))
      )
    },
    [persist]
  )

  const removeDeck = useCallback(
    (id) => {
      persist((prev) => prev.filter((d) => d.id !== id))
    },
    [persist]
  )

  const addMatch = useCallback(
    (deckId, { opponent = '', yourGames = 0, oppGames = 0, notes = '' }) => {
      const yg = Number(yourGames) || 0
      const og = Number(oppGames) || 0
      const match = {
        id: uid(),
        opponent: opponent.trim(),
        yourGames: yg,
        oppGames: og,
        result: yg > og ? 'win' : yg < og ? 'loss' : 'draw',
        notes: notes.trim(),
        date: Date.now(),
      }
      persist((prev) =>
        prev.map((d) =>
          d.id === deckId ? { ...d, matches: [match, ...d.matches] } : d
        )
      )
      return match
    },
    [persist]
  )

  const removeMatch = useCallback(
    (deckId, matchId) => {
      persist((prev) =>
        prev.map((d) =>
          d.id === deckId
            ? { ...d, matches: d.matches.filter((m) => m.id !== matchId) }
            : d
        )
      )
    },
    [persist]
  )

  return { decks, addDeck, updateDeck, removeDeck, addMatch, removeMatch }
}
