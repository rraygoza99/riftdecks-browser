/**
 * Single-deck scraper + parser for riftdecks.com decklists.
 *
 * Splits a deck detail page into its 40-card main deck, 12-card rune deck,
 * battlefields and legend, then (optionally) feeds the composition into the
 * hypergeometric engine to report opening-hand odds.
 *
 * Usage:
 *   node scripts/scrape-deck.mjs                       # parse the bundled example HTML
 *   node scripts/scrape-deck.mjs --file path/deck.html # parse a local HTML file
 *   node scripts/scrape-deck.mjs <deck-url>            # fetch a live deck via Playwright
 *   node scripts/scrape-deck.mjs --json                # print raw JSON
 *   node scripts/scrape-deck.mjs --odds                # print sample draw odds
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { atLeast, atLeastOne, multivariate, formatPercent } from '../src/probability/hypergeometric.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLE = path.join(__dirname, 'deck-example.html')
const BASE = 'https://riftdecks.com'

// Card types that live outside the shuffled 40-card main deck.
const RUNE_TYPES = new Set(['runes', 'rune'])

// --- Pure HTML parsing -------------------------------------------------

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function firstMatch(re, html) {
  const m = html.match(re)
  return m ? decodeEntities(m[1]) : null
}

// Parse a single <tr class="card-list-item"> block into a card record.
function parseCardRow(attrs, body) {
  const type = (attrs.match(/data-card-type="([^"]*)"/)?.[1] || 'other').toLowerCase()
  const quantity = parseInt(attrs.match(/data-quantity="(\d+)"/)?.[1] || '1', 10) || 1
  const imgSrc = attrs.match(/data-image-src="([^"]*)"/)?.[1] || ''

  const link = body.match(/href="\/cards\/(details-[^"]+)"\s*>\s*([\s\S]*?)<\/a>/)
  const slug = link ? link[1] : ''
  const name = link ? decodeEntities(link[2].replace(/\s+/g, ' ')) : ''

  const priceMatch = body.match(/\$([\d.]+)/)
  const price = priceMatch ? parseFloat(priceMatch[1]) : null

  const runes = [...new Set([...body.matchAll(/rune_([a-z]+)\.png/g)].map((m) => m[1]))]

  return {
    name,
    slug,
    type,
    quantity,
    imageSrc: imgSrc ? BASE + imgSrc : '',
    price,
    runes,
  }
}

/**
 * Parse a deck detail HTML string into structured zones.
 * @returns {{ meta, legend, mainDeck, runeDeck, battlefields, counts }}
 */
export function parseDeckHtml(html) {
  const cards = []
  const rowRe = /<tr class="card-list-item"([^>]*)>([\s\S]*?)<\/tr>/g
  let m
  while ((m = rowRe.exec(html)) !== null) {
    const card = parseCardRow(m[1], m[2])
    if (card.name) cards.push(card)
  }

  const legend = cards.find((c) => c.type === 'legend') || null
  const battlefields = cards.filter((c) => c.type.startsWith('battlefield'))
  const runeDeck = cards.filter((c) => RUNE_TYPES.has(c.type))
  const sideboard = cards.filter((c) => c.type === 'sideboard')
  const mainDeck = cards.filter(
    (c) =>
      c.type !== 'legend' &&
      c.type !== 'sideboard' &&
      !RUNE_TYPES.has(c.type) &&
      !c.type.startsWith('battlefield'),
  )

  const sumQty = (list) => list.reduce((s, c) => s + c.quantity, 0)

  // Best-effort metadata; missing fields degrade gracefully to null.
  const heading = firstMatch(/<h1 class="page-title[^>]*>([\s\S]*?)<\/h1>/, html)
  let title = heading
  let author = null
  if (heading) {
    const byIdx = heading.lastIndexOf(' by ')
    if (byIdx !== -1) {
      title = heading.slice(0, byIdx).trim()
      author = heading.slice(byIdx + 4).trim()
    }
  }
  const desc = firstMatch(/<meta name="og:description" content="([^"]*)"/, html) || ''
  const standing = desc.match(/(\d+)(?:st|nd|rd|th)\s+at/)?.[1] ?? null
  const date = desc.match(/on\s+(\d{4}-\d{2}-\d{2})/)?.[1] ?? null
  const players =
    parseInt(html.match(/(\d+)\s+players/)?.[1] || '', 10) || null
  const tournamentMatch = html.match(
    /(?:st|nd|rd|th)\s+at\s*<span[^>]*class="text-theme-light">([\s\S]*?)<\/span>/,
  )
  const tournament = tournamentMatch ? decodeEntities(tournamentMatch[1]) : null

  return {
    meta: {
      title,
      author,
      legendName: legend?.name ?? null,
      standing: standing != null ? Number(standing) : null,
      players,
      date,
      tournament,
    },
    legend,
    mainDeck,
    runeDeck,
    battlefields,
    sideboard,
    counts: {
      mainDeckSize: sumQty(mainDeck),
      runeDeckSize: sumQty(runeDeck),
      battlefieldCount: sumQty(battlefields),
      sideboardSize: sumQty(sideboard),
    },
  }
}

// Convert a parsed deck into a hypergeometric config for the main deck: each
// distinct card becomes a category sized by its copy count.
export function toMainDeckConfig(deck) {
  return {
    N: deck.counts.mainDeckSize,
    cards: deck.mainDeck.map((c) => ({ name: c.name, K: c.quantity })),
  }
}

// --- Live fetch (Playwright) -------------------------------------------

async function fetchDeckHtml(deckUrl) {
  const { chromium } = await import('playwright-extra')
  const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth')
  chromium.use(StealthPlugin())
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(deckUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('tr.card-list-item', { timeout: 15000 }).catch(() => {})
    return page.content()
  } finally {
    await browser.close()
  }
}

// --- Reporting ---------------------------------------------------------

function printSummary(deck) {
  const { meta, counts } = deck
  console.log(`\n${meta.title ?? 'Untitled deck'}${meta.author ? ` by ${meta.author}` : ''}`)
  if (meta.legendName) console.log(`Legend:      ${meta.legendName}`)
  if (meta.tournament) console.log(`Event:       ${meta.tournament}${meta.standing ? ` (placed ${meta.standing})` : ''}`)
  console.log(`Main deck:   ${counts.mainDeckSize} cards (${deck.mainDeck.length} distinct)`)
  console.log(`Rune deck:   ${counts.runeDeckSize} runes`)
  console.log(`Battlefields:${counts.battlefieldCount ? ` ${counts.battlefieldCount}` : ' 0'}`)

  console.log('\nMain deck:')
  for (const c of deck.mainDeck) {
    console.log(`  ${String(c.quantity).padStart(2)}x  ${c.name}`)
  }
}

function printOdds(deck) {
  const N = deck.counts.mainDeckSize
  if (!N) return
  const HAND = 4
  console.log(`\nOpening-hand odds (main deck N=${N}, hand=${HAND}):`)
  const sorted = [...deck.mainDeck].sort((a, b) => b.quantity - a.quantity)
  for (const c of sorted.slice(0, 8)) {
    const one = atLeastOne(N, c.quantity, HAND)
    const two = c.quantity >= 2 ? atLeast(N, c.quantity, HAND, 2) : 0
    console.log(
      `  ${c.name} (${c.quantity} copies): >=1 ${formatPercent(one)}` +
        (c.quantity >= 2 ? ` | >=2 ${formatPercent(two)}` : ''),
    )
  }

  // Two-piece combo example using the two most-played distinct cards.
  if (sorted.length >= 2) {
    const [a, b] = sorted
    const p = multivariate(N, HAND, [
      { name: a.name, size: a.quantity, min: 1 },
      { name: b.name, size: b.quantity, min: 1 },
    ])
    console.log(
      `\nCombo (>=1 ${a.name} AND >=1 ${b.name}) in opener: ${formatPercent(p)}`,
    )
  }
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (f) => args.includes(f)
  const getArg = (f) => {
    const i = args.indexOf(f)
    return i !== -1 ? args[i + 1] : null
  }
  const urlArg = args.find((a) => a.startsWith('http'))
  const fileArg = getArg('--file')

  let html
  if (urlArg) {
    console.error(`Fetching ${urlArg} ...`)
    html = await fetchDeckHtml(urlArg)
  } else {
    const file = fileArg ? path.resolve(fileArg) : EXAMPLE
    html = await fs.readFile(file, 'utf8')
  }

  const deck = parseDeckHtml(html)

  if (flag('--json')) {
    console.log(JSON.stringify(deck, null, 2))
    return
  }
  printSummary(deck)
  if (flag('--odds')) printOdds(deck)
}

// Only run the CLI when invoked directly (keeps the parser importable).
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('scrape-deck.mjs')) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
