/**
 * riftdecks-browser scraper
 *
 * All fetches go through the Vite dev proxy at /riftdecks → https://riftdecks.com
 * HTML is parsed in-browser with DOMParser; results are cached in localStorage.
 */

const PROXY = '/riftdecks'
const CACHE_PREFIX = 'rdb_'
const CACHE_TTL = 30 * 60 * 1000 // 30 min

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(CACHE_PREFIX + key)
      return null
    }
    return data
  } catch {
    return null
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, ts: Date.now() }))
  } catch {
    // Ignore quota errors — cache is best-effort
  }
}

// ---------------------------------------------------------------------------
// Fetch + parse helpers
// ---------------------------------------------------------------------------
async function fetchHtml(path) {
  const cached = cacheGet(path)
  if (cached) return new DOMParser().parseFromString(cached, 'text/html')

  const res = await fetch(`${PROXY}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${path}`)
  const text = await res.text()
  cacheSet(path, text)
  return new DOMParser().parseFromString(text, 'text/html')
}

// Run multiple async tasks with a bounded concurrency limit
async function batchedAsync(tasks, concurrency = 4) {
  const results = []
  for (let i = 0; i < tasks.length; i += concurrency) {
    const chunk = tasks.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map((fn) => fn()))
    for (const s of settled) {
      results.push(s.status === 'fulfilled' ? s.value : null)
    }
  }
  return results.filter(Boolean)
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------
function toPath(url) {
  if (!url) return ''
  if (url.startsWith('http')) {
    try {
      return new URL(url).pathname
    } catch {
      return url
    }
  }
  return url
}

/** Extract the legend name slug from a deck URL.
 *  /riftbound-metagame/deck-draven-glorious-executioner-94369
 *  → draven-glorious-executioner
 */
function legendSlugFromDeckUrl(deckUrl) {
  const slug = deckUrl.split('/').pop() || ''
  return slug.replace(/^deck-/, '').replace(/-\d+$/, '')
}

/** Convert a kebab-case slug to Title Case display name.
 *  draven-glorious-executioner → Draven Glorious Executioner
 */
export function slugToTitle(slug) {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Extract the numeric deck ID from a deck URL. */
function deckIdFromUrl(deckUrl) {
  const m = deckUrl.match(/(\d+)$/)
  return m ? m[1] : ''
}

// ---------------------------------------------------------------------------
// Tournament list
// ---------------------------------------------------------------------------
/**
 * Fetches paginated tournament list from riftdecks.com
 *
 * @param {object} opts
 * @param {number} opts.maxPages   - how many list pages to fetch (default 3)
 * @param {number} opts.relevance  - riftdecks relevance filter 0-3 (default 2)
 * @returns {Array<{name, url, date}>}
 */
export async function fetchTournamentList({ maxPages = 3, relevance = 2 } = {}) {
  const tournaments = []

  for (let page = 1; page <= maxPages; page++) {
    const path = `/riftbound-tournaments?relevance=${relevance}&page=${page}`
    let doc
    try {
      doc = await fetchHtml(path)
    } catch (err) {
      console.warn(`Failed to fetch tournament list page ${page}:`, err)
      break
    }

    const rows = doc.querySelectorAll('tr[data-href]')
    if (!rows.length) break

    for (const row of rows) {
      const url = row.getAttribute('data-href') || ''
      if (!url) continue

      const nameEl = row.querySelector('td:nth-child(3) a')
      const dateEl = row.querySelector('td:first-child b')
      const name = nameEl?.textContent.trim() || 'Unknown Tournament'
      const dateStr = dateEl?.textContent.trim() || ''
      // Parse date as UTC midnight to avoid timezone offset shifting the day
      const date = dateStr ? new Date(dateStr + 'T00:00:00Z') : null
      tournaments.push({ name, url, date })
    }

    // Stop if there's no "next page" link
    const nextLink = doc.querySelector('li.page-item a[rel="next"]')
    if (!nextLink) break
  }

  return tournaments
}

// ---------------------------------------------------------------------------
// Decks inside a tournament page
// ---------------------------------------------------------------------------

/** Extract background-image URL from a style string like "background-image: url('...')" */
function parseBgImageUrl(style) {
  const m = style.match(/background-image:\s*url\(['"]?([^'"\)]+)['"]?\)/i)
  return m ? m[1] : ''
}

/**
 * Fetches all deck entries from a single tournament page.
 * Price, legend name, and legend tile image are read directly from the row —
 * no per-deck detail request needed.
 *
 * @param {string} tournamentUrl
 * @param {{name: string, date: Date}} tournamentMeta
 * @returns {Array<DeckEntry>}
 */
export async function fetchTournamentDecks(tournamentUrl, tournamentMeta) {
  const path = toPath(tournamentUrl)
  let doc
  try {
    doc = await fetchHtml(path)
  } catch (err) {
    console.warn(`Failed to fetch tournament ${tournamentUrl}:`, err)
    return []
  }

  const rows = doc.querySelectorAll('tr[id^="desktop-deck-"]')
  const decks = []

  for (const row of rows) {
    const rankEl = row.querySelector('td:first-child strong')
    const deckLinkEl = row.querySelector('td:nth-child(3) a')
    const deckUrl = row.getAttribute('data-href') || ''

    if (!deckUrl) continue

    const rankText = rankEl?.textContent.trim() || '99'
    const standing = parseInt(rankText.replace(/\D/g, ''), 10) || 99
    const deckName = deckLinkEl?.textContent.trim() || 'Unknown Deck'

    // Legend name with proper punctuation (e.g. "Draven, Glorious Executioner")
    // is stored in the title attribute of the avatar span in column 2.
    const avatarEl = row.querySelector('td:nth-child(2) span.avatar[title]')
    const legendName = avatarEl?.getAttribute('title')?.trim() || slugToTitle(legendSlugFromDeckUrl(deckUrl))

    // Legend tile image — background-image on the same avatar span.
    const avatarStyle = avatarEl?.getAttribute('style') || ''
    const avatarBg = parseBgImageUrl(avatarStyle)
    const legendTileUrl = avatarBg ? `https://riftdecks.com${avatarBg}` : ''

    // Real price is already in the tournament page: td.text-end span.text-green
    // Contains a string like "$536.75" — parse to a float.
    const priceEl = row.querySelector('td.text-end span.text-green')
    const priceText = priceEl?.textContent.trim().replace(/[^\d.]/g, '') || ''
    const price = priceText ? parseFloat(priceText) : null

    const legendSlug = legendSlugFromDeckUrl(deckUrl)
    const deckId = deckIdFromUrl(deckUrl)

    decks.push({
      id: `${deckId || deckUrl}`,
      deckId,
      deckName,
      deckUrl,
      legendSlug,
      legendName,
      legendTileUrl,
      price,          // real price from tournament listing (USD, may be null)
      standing,
      tournamentName: tournamentMeta?.name || 'Unknown Tournament',
      tournamentDate: tournamentMeta?.date || null,
      details: null,
    })
  }

  return decks
}

// ---------------------------------------------------------------------------
// Load multiple tournament pages + their decks in one call
// ---------------------------------------------------------------------------
/**
 * Loads a full page of the tournament list AND the decks for every tournament on it.
 *
 * @param {number} listPage - which page of the tournament list to load
 * @param {object} opts     - same options as fetchTournamentList
 * @returns {{ decks: DeckEntry[], hasMore: boolean }}
 */
export async function loadDecksFromTournamentPage(listPage = 1, opts = {}) {
  const relevance = opts.relevance ?? 2
  const path = `/riftbound-tournaments?relevance=${relevance}&page=${listPage}`
  let doc
  try {
    doc = await fetchHtml(path)
  } catch (err) {
    console.warn('Failed to load tournament list page:', err)
    return { decks: [], hasMore: false }
  }

  const rows = Array.from(doc.querySelectorAll('tr[data-href]'))
  if (!rows.length) return { decks: [], hasMore: false }

  const tournaments = rows.map((row) => {
    const url = row.getAttribute('data-href') || ''
    const nameEl = row.querySelector('td:nth-child(3) a')
    const dateEl = row.querySelector('td:first-child b')
    const name = nameEl?.textContent.trim() || 'Unknown'
    const dateStr = dateEl?.textContent.trim() || ''
    const date = dateStr ? new Date(dateStr + 'T00:00:00Z') : null
    return { url, name, date }
  }).filter((t) => t.url)

  // Fetch all tournament deck pages in parallel (limited concurrency)
  const deckArrays = await batchedAsync(
    tournaments.map((t) => () => fetchTournamentDecks(t.url, t)),
    5
  )

  const decks = deckArrays.flat()

  const hasMore = !!doc.querySelector('li.page-item a[rel="next"]')
  return { decks, hasMore }
}

// ---------------------------------------------------------------------------
// Deck detail (card list + estimated price)
// ---------------------------------------------------------------------------

/** Rough market price estimates per rarity tier (USD) */
const RARITY_PRICE = {
  common: 0.2,
  uncommon: 0.6,
  rare: 2.5,
  epic: 10,
  legend: 6,
}

/**
 * Lazily loads the full card list and estimated price for a deck.
 *
 * @param {string} deckUrl
 * @returns {{ cards: CardEntry[], estimatedPrice: number }}
 */
export async function fetchDeckDetails(deckUrl) {
  const path = toPath(deckUrl)
  const doc = await fetchHtml(path)
  const rows = doc.querySelectorAll('tr.card-list-item')

  const cards = []
  let estimatedPrice = 0

  for (const row of rows) {
    const quantity = parseInt(row.getAttribute('data-quantity') || '1', 10) || 1
    const cardType = row.getAttribute('data-card-type') || 'unit'

    const nameEl = row.querySelector('td:nth-child(3) a')
    const cardName = nameEl?.textContent.trim() || 'Unknown'

    // Rarity comes from alt text on rarity icon images in the 5th column
    let rarity = 'common'
    const rarityImgs = row.querySelectorAll('td:nth-child(5) img[alt]')
    for (const img of rarityImgs) {
      const alt = (img.getAttribute('alt') || '').toLowerCase()
      if (['common', 'uncommon', 'rare', 'epic'].includes(alt)) {
        rarity = alt
        break
      }
    }

    // For legend cards use a separate price tier
    if (cardType === 'legend') rarity = 'legend'

    const cardPrice = (RARITY_PRICE[rarity] ?? 0.2) * quantity
    estimatedPrice += cardPrice

    // Extract card image from data-image-src if available
    const imageSrc = row.getAttribute('data-image-src') || ''

    cards.push({
      cardName,
      quantity,
      rarity,
      cardType,
      imageSrc,
      cardPrice: +cardPrice.toFixed(2),
    })
  }

  return {
    cards,
    estimatedPrice: Math.round(estimatedPrice * 100) / 100,
  }
}
