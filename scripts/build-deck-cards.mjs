/**
 * Build public/deck-cards.json — a compact per-deck card-list export the app
 * uses for every card-level analysis (inclusion, lift, copies, variants,
 * consensus lists, battlefields, sideboards, consistency vs results).
 *
 * Sources:
 *   data/deck-cards.json      scraped card lists, keyed by deck id (cache)
 *   public/decks.json         deck metadata; only decks still listed here are
 *                             exported so filters (date/meta/region) apply
 *   data/card-attributes.json riftcodex card records keyed by code (cache);
 *                             missing codes are fetched unless --no-api
 *
 * Usage:
 *   node scripts/build-deck-cards.mjs            # fetch missing riftcodex data
 *   node scripts/build-deck-cards.mjs --no-api   # offline, cache only
 *
 * Also called at the end of scripts/scrape.mjs.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { codeFromImageSrc, fetchCard } from './cardApi.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const CARDS_CACHE = path.join(ROOT, 'data/deck-cards.json')
const DECKS = path.join(ROOT, 'public/decks.json')
const ATTR_CACHE = path.join(ROOT, 'data/card-attributes.json')
const OUTPUT = path.join(ROOT, 'public/deck-cards.json')

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

// Keep only the riftcodex fields the app/simulator read.
function trimApiCard(card) {
  if (!card) return null
  return {
    name: card.name,
    riftbound_id: card.riftbound_id,
    attributes: card.attributes || {},
    classification: {
      type: card.classification?.type ?? null,
      supertype: card.classification?.supertype ?? null,
      rarity: card.classification?.rarity ?? null,
      domain: card.classification?.domain || [],
    },
    tags: card.tags || [],
  }
}

async function resolveAttributes(codes, cache, { useApi, concurrency = 6 }) {
  const missing = [...codes].filter((c) => !(c in cache))
  if (!useApi || !missing.length) return 0
  console.log(`  Fetching ${missing.length} card record(s) from riftcodex…`)
  let cursor = 0
  let fetched = 0
  const worker = async () => {
    while (cursor < missing.length) {
      const code = missing[cursor++]
      const card = await fetchCard(code)
      cache[code] = trimApiCard(card) // null = negative cache
      if (card) fetched++
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return fetched
}

export async function buildDeckCards({ useApi = true, log = console.log } = {}) {
  const cardCache = await readJson(CARDS_CACHE, {})
  const deckData = await readJson(DECKS, { decks: [] })
  const attrCache = await readJson(ATTR_CACHE, {})
  const listed = new Set(deckData.decks.map((d) => String(d.deckId)))

  const exportIds = Object.keys(cardCache).filter((id) => listed.has(id) && cardCache[id]?.cards?.length)

  // Card index: one entry per (name, section type). Price/image keep the
  // most recently fetched value.
  const index = new Map()
  const entries = []
  const codes = new Set()
  const decks = {}
  for (const id of exportIds) {
    const entry = cardCache[id]
    const rows = []
    for (const c of entry.cards) {
      if (!c.name) continue
      const type = c.type || 'other'
      const key = `${c.name}|${type}`
      let i = index.get(key)
      if (i == null) {
        i = entries.length
        const code = codeFromImageSrc(c.imageSrc)
        if (code) codes.add(code)
        index.set(key, i)
        entries[i] = { name: c.name, type, cardUrl: c.cardUrl || '', img: c.imageSrc || '', price: c.price ?? null, rarity: c.rarity || '', runes: c.runes || [], code }
      } else if (c.price != null) {
        entries[i].price = c.price
      }
      rows.push([i, c.quantity || 1])
    }
    decks[id] = rows
  }

  const fetched = await resolveAttributes(codes, attrCache, { useApi })
  if (fetched) await fs.writeFile(ATTR_CACHE, JSON.stringify(attrCache, null, 2))

  const cards = []
  for (const c of entries) {
    const api = c.code ? attrCache[c.code] : null
    const energy = api?.attributes?.energy
    cards.push({
      ...c,
      energy: Number.isFinite(energy) ? energy : null,
      cardType: api?.classification?.type ?? null, // riftcodex type (Unit/Spell/Gear/…)
      domain: api?.classification?.domain || [],
      set: c.code ? c.code.split('-')[0] : null,
    })
  }

  const out = {
    generatedAt: new Date().toISOString(),
    deckCount: exportIds.length,
    cardCount: cards.length,
    attributesResolved: cards.filter((c) => c.energy != null).length,
    cards,
    decks,
  }
  await fs.writeFile(OUTPUT, JSON.stringify(out))
  log(
    `Deck cards: ${exportIds.length} deck list(s) of ${listed.size} listed decks, ` +
      `${cards.length} cards (${out.attributesResolved} with energy cost) → ${OUTPUT}`
  )
  return out
}

// Run directly.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildDeckCards({ useApi: !process.argv.includes('--no-api') }).catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
