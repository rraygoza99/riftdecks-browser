// Decklist-text importer for the Consistency page.
//
// Parses the plain-text export format:
//   Legend:
//   1 Reksai, Void Burrower
//   MainDeck:
//   3 Cleave
//   ...
//   Rune Pool:
//   7 Fury Rune
//   Sideboard:
//   3 Ferrous Forerunner
//
// then resolves each main-deck card's energy cost / type / tags from the
// riftcodex name API (CORS-open) into a simulator-ready deck definition.

const NAME_API = 'https://api.riftcodex.com/cards/name'

// Map a section heading to a canonical bucket.
const SECTION_ALIASES = {
  legend: 'legend',
  maindeck: 'main',
  main: 'main',
  runepool: 'rune',
  runes: 'rune',
  runedeck: 'rune',
  sideboard: 'side',
}

function normalizeType(apiType) {
  const t = (apiType || '').toLowerCase()
  if (t === 'spell') return 'spell'
  if (t === 'gear') return 'gear'
  return 'unit'
}

// Deterministic fallback cost when a card can't be resolved (keeps sim runnable).
function synthCost(name) {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 5) + 1
}

/**
 * Parse the plain-text decklist into sections.
 * @returns {{ legendName, mainDeck, runePool, sideboard }}
 */
export function parseDeckList(text) {
  const out = { legendName: null, mainDeck: [], runePool: [], sideboard: [] }
  let section = null
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const header = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/)
    if (header) {
      const key = header[1].toLowerCase().replace(/\s+/g, '')
      section = SECTION_ALIASES[key] ?? null
      if (!header[2]) continue // pure header line
      // Support "Legend: 1 Name" on a single line.
      parseEntryInto(out, section, header[2])
      continue
    }
    parseEntryInto(out, section, line)
  }
  return out
}

function parseEntryInto(out, section, str) {
  const m = str.match(/^(\d+)\s*x?\s+(.+?)\s*$/i)
  if (!m || !section) return
  const entry = { count: parseInt(m[1], 10), name: m[2].trim() }
  if (section === 'legend') out.legendName = entry.name
  else if (section === 'main') out.mainDeck.push(entry)
  else if (section === 'rune') out.runePool.push(entry)
  else if (section === 'side') out.sideboard.push(entry)
}

// Resolve one card's attributes by exact name.
async function fetchCardByName(name) {
  const url = `${NAME_API}?exact=${encodeURIComponent(name)}&dir=1&page=1&size=50`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  return data.items?.[0] ?? null
}

/**
 * Enrich a parsed decklist into a simulator deck definition.
 * @param {object} parsed - output of parseDeckList.
 * @param {object} [opts]
 * @param {(done:number,total:number)=>void} [opts.onProgress]
 * @returns {Promise<{ deckDef, unresolved: string[] }>}
 */
export async function enrichDeckList(parsed, { onProgress, concurrency = 6 } = {}) {
  const names = [...new Set(parsed.mainDeck.map((c) => c.name))]
  const attrs = {}
  const queue = [...names]
  let done = 0

  const worker = async () => {
    while (queue.length) {
      const name = queue.shift()
      attrs[name] = await fetchCardByName(name).catch(() => null)
      done += 1
      onProgress?.(done, names.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, names.length || 1) }, worker))

  const unresolved = []
  const cards = parsed.mainDeck.map((c) => {
    const card = attrs[c.name]
    const energy = card?.attributes?.energy
    if (!card) unresolved.push(c.name)
    return {
      name: c.name,
      count: c.count,
      cost: Number.isFinite(energy) ? energy : synthCost(c.name),
      type: normalizeType(card?.classification?.type),
      tags: [...(card?.classification?.domain || []), ...(card?.tags || [])],
    }
  })

  const mainDeckSize = parsed.mainDeck.reduce((s, c) => s + c.count, 0)
  const runeDeckSize = parsed.runePool.reduce((s, c) => s + c.count, 0)
  const resolved = names.length - unresolved.length

  return {
    deckDef: {
      meta: {
        title: parsed.legendName ? `${parsed.legendName.split(',')[0]} (imported)` : 'Imported deck',
        legendName: parsed.legendName,
        mainDeckSize,
        runeDeckSize,
        distinctCards: parsed.mainDeck.length,
        costSource: unresolved.length ? `api (${resolved}/${names.length} resolved)` : 'api',
      },
      cards,
    },
    unresolved,
  }
}
