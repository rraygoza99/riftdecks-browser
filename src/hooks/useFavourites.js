import { useState, useCallback } from 'react'

const LS_KEY = 'riftdecks_favourites'

function load() {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

function save(set) {
  localStorage.setItem(LS_KEY, JSON.stringify([...set]))
}

export default function useFavourites() {
  const [favourites, setFavourites] = useState(load)

  const toggleFavourite = useCallback((deckUrl) => {
    setFavourites((prev) => {
      const next = new Set(prev)
      if (next.has(deckUrl)) {
        next.delete(deckUrl)
      } else {
        next.add(deckUrl)
      }
      save(next)
      return next
    })
  }, [])

  const isFavourite = useCallback(
    (deckUrl) => favourites.has(deckUrl),
    [favourites]
  )

  return { favourites, toggleFavourite, isFavourite }
}
