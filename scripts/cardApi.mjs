/**
 * riftcodex card API client + deck enrichment.
 *
 * Fetches real card attributes (energy cost, type, tags, domain) on demand for
 * the specific decks a user wants to analyse, then caches them locally so the
 * same card is never fetched twice.
 *
 * API shape (array with one entry):
 *   GET https://api.riftcodex.com/cards/riftbound/OGN-211
 *   -> [{ name, riftbound_id: "ogn-211-298", attributes: { energy, might, power },
 *         classification: { type, domain, ... }, tags: [...] }]
 */

import fs from 'fs/promises'

const API_BASE = 'https://api.riftcodex.com/cards/riftbound'

// Weighted energy-cost curve, used only as a fallback when a card can't be
// resolved from the API (keeps a simulation runnable rather than crashing).
const COST_CURVE = [
  [1, 20],
  [2, 25],
  [3, 20],
  [4, 15],
  [5, 10],
  [6, 6],
  [7, 3],
  [8, 1],
]

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function synthesizeCost(name) {
  const roll = hashString(name || '') % 100
  let acc = 0
  for (const [cost, weight] of COST_CURVE) {
    acc += weight
    if (roll < acc) return cost
  }
  return 3
}

export function normalizeType(type) {
  const t = (type || '').toLowerCase()
  if (t === 'spell') return 'spell'
  if (t === 'gear') return 'gear'
  return 'unit'
}

// Derive the API code (e.g. "OGN-211") from a card image src / riftbound id
// like ".../OGN/ogn-211-298_full.png" or "ogn-211-298".
export function codeFromImageSrc(src) {
  const m = (src || '').match(/([a-z0-9]+)-(\d+)-\d+(?:_[a-z]+)?\.png/i) || (src || '').match(/^([a-z0-9]+)-(\d+)-\d+$/i)
  if (!m) return null
  return `${m[1].toUpperCase()}-${m[2]}`
}

// Fetch a single card record; returns the object or null on any failure.
export async function fetchCard(code) {
  try {
    const res = await fetch(`${API_BASE}/${code}`)
    if (!res.ok) return null
    const data = await res.json()
    const card = Array.isArray(data) ? data[0] : data
    return card || null
  } catch {
    return null
  }
}

async function loadCache(cachePath) {
  if (!cachePath) return {}
  try {
    return JSON.parse(await fs.readFile(cachePath, 'utf8'))
  } catch {
    return {}
  }
}

async function saveCache(cachePath, cache) {
  if (!cachePath) return
  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2))
}

// Map a raw API card into the simulator's attribute shape.
function attributesFromApi(card, fallbackName) {
  const energy = card?.attributes?.energy
  const type = normalizeType(card?.classification?.type)
  const domain = card?.classification?.domain || []
  const tags = [...domain, ...(card?.tags || [])]
  return {
    cost: Number.isFinite(energy) ? energy : synthesizeCost(fallbackName),
    type,
    tags,
    resolved: Number.isFinite(energy),
  }
}

/**
 * Enrich a parsed riftdecks deck with real card attributes from the API.
 *
 * @param {object} parsed - output of parseDeckHtml (needs .mainDeck, .meta, .counts).
 * @param {object} [opts]
 * @param {string} [opts.cachePath] - JSON file to read/write resolved cards.
 * @param {boolean} [opts.useApi=true] - when false, skip the API and synthesise costs.
 * @param {number} [opts.concurrency=6] - parallel API requests.
 * @returns {Promise<{ meta, cards }>} a deck definition ready for the simulator.
 */
export async function enrichDeckDef(parsed, opts = {}) {
  const { cachePath = null, useApi = true, concurrency = 6 } = opts
  const cache = useApi ? await loadCache(cachePath) : {}

  // Resolve each distinct card once, keyed by its API code.
  const jobs = parsed.mainDeck.map((c) => ({ card: c, code: codeFromImageSrc(c.imageSrc) }))
  let fetched = 0

  if (useApi) {
    const queue = jobs.filter((j) => j.code && !cache[j.code])
    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        const { code } = queue[cursor++]
        const card = await fetchCard(code)
        if (card) {
          cache[code] = card
          fetched++
        } else {
          cache[code] = null // negative cache to avoid re-fetching misses
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker))
    if (fetched > 0) await saveCache(cachePath, cache)
  }

  let resolvedCount = 0
  const cards = jobs.map(({ card, code }) => {
    const apiCard = code ? cache[code] : null
    const attrs = attributesFromApi(apiCard, card.name)
    if (attrs.resolved) resolvedCount++
    return {
      name: card.name,
      count: card.quantity,
      cost: attrs.cost,
      type: attrs.type,
      tags: attrs.tags,
      code: code || null,
    }
  })

  const costSource =
    !useApi ? 'synthesised' : resolvedCount === cards.length ? 'api' : `api (${resolvedCount}/${cards.length} resolved)`

  return {
    meta: {
      title: parsed.meta.title,
      legendName: parsed.meta.legendName,
      mainDeckSize: parsed.counts.mainDeckSize,
      runeDeckSize: parsed.counts.runeDeckSize,
      distinctCards: parsed.mainDeck.length,
      costSource,
    },
    cards,
  }
}
