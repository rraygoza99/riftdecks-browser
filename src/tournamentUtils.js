// Helpers for grouping loaded decks into tournaments and building the URL-safe
// keys shared between the Tournaments list and the tournament detail view.

export function slugify(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function dateToIso(date) {
  if (!date) return ''
  if (date instanceof Date) return date.toISOString().slice(0, 10)
  return String(date).slice(0, 10)
}

// Stable identifier for a tournament. Prefers the scraped tournament id and
// falls back to a name+date slug so older data (without ids) still works.
export function tournamentKey(deck) {
  if (deck.tournamentId) return String(deck.tournamentId)
  const slug = slugify(deck.tournamentName)
  const iso = dateToIso(deck.tournamentDate)
  return `${slug}-${iso}` || 'unknown'
}

// Collapse a flat deck list into one entry per tournament.
export function groupTournaments(decks) {
  const map = new Map()
  for (const d of decks) {
    const key = tournamentKey(d)
    let t = map.get(key)
    if (!t) {
      t = {
        key,
        name: d.tournamentName || 'Unknown',
        date: d.tournamentDate || null,
        country: d.tournamentCountry || null,
        players: d.totalPlayers ?? null,
        metaSet: d.metaSet || null,
        decks: [],
      }
      map.set(key, t)
    }
    if (t.players == null && d.totalPlayers != null) t.players = d.totalPlayers
    if (!t.country && d.tournamentCountry) t.country = d.tournamentCountry
    t.decks.push(d)
  }
  return [...map.values()]
}

// Convert an ISO 3166-1 alpha-2 code (e.g. "BR") into its flag emoji.
export function countryFlagEmoji(code) {
  const cc = (code || '').toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return ''
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}
