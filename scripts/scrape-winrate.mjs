/**
 * Scraper + parser for the riftdecks winrate matrix.
 *
 *   GET https://riftdecks.com/stats/winrate?metagame_id=4&relevance=2&date_range=last_six_months
 *
 * The matrix is server-rendered: a thead of opponent legends and a tbody of
 * `tr.item` rows carrying data-name / data-winrate / data-matches, each with
 * `td.winrate-cell[data-winrate]` cells (or "--" for no data).
 *
 * RiftDecks now requires a login for this page, so live mode opens a visible
 * browser window. You log in there yourself the first time (the script never
 * sees your password); the session is kept in a browser profile in your home
 * folder, outside the repo, so later runs go straight to the matrix.
 *
 * Usage:
 *   node scripts/scrape-winrate.mjs                       # live (Vendetta, competitive, 6mo)
 *   node scripts/scrape-winrate.mjs --metagame 4 --relevance 2 --date-range last_six_months
 *   node scripts/scrape-winrate.mjs --file winrate-page.html   # parse a saved page
 *   node scripts/scrape-winrate.mjs --out data/winrate-matrix.json
 */

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_OUT = path.join(__dirname, '../data/winrate-matrix.json')
// Holds your RiftDecks session cookies: deliberately not in the (synced) repo.
const PROFILE_DIR = path.join(os.homedir(), '.riftdecks-browser-profile')
const LOGIN_TIMEOUT_MS = 10 * 60_000

function decodeEntities(s) {
  return (s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/**
 * Parse the winrate matrix HTML into a structured object.
 * @returns {{ metagame, matchesAnalyzed, legends, matrix }}
 */
export function parseWinrateMatrix(html) {
  const matchesAnalyzed = parseInt(
    (html.match(/([\d,]+)\s+Matches Analyzed/) || [])[1]?.replace(/,/g, '') || '0',
    10,
  )
  const metagame = decodeEntities(
    (html.match(/<option value="\d+" selected="selected">([^<]+)<\/option>/) || [])[1] || '',
  )

  // Column order comes from the thead legend headers (full names via title="").
  const theadHtml = (html.match(/<thead>([\s\S]*?)<\/thead>/) || [])[1] || ''
  const columns = [...theadHtml.matchAll(/<span title="([^"]+)"\s+class="avatar/g)].map((m) =>
    decodeEntities(m[1]),
  )

  // Each tbody row = one legend's matchup line.
  const tbodyHtml = (html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || ''
  const rowRe = /<tr class="item"\s+data-name="([^"]+)"\s+data-winrate="([^"]+)"\s+data-matches="(\d+)">([\s\S]*?)<\/tr>/g

  const legends = []
  const matrix = {}
  let rm
  while ((rm = rowRe.exec(tbodyHtml)) !== null) {
    const name = decodeEntities(rm[1])
    const overall = Math.round(parseFloat(rm[2]) * 10000) / 100 // 0..1 -> percent
    const matches = parseInt(rm[3], 10)
    const rowBody = rm[4]

    legends.push({ name, overallWinrate: overall, matches })

    // Cells in order: [Overall, col_0, col_1, ...]. Skip the leading Overall.
    const cells = rowBody.split('<td class="winrate-cell"').slice(1)
    const opponentCells = cells.slice(1)
    matrix[name] = {}
    opponentCells.forEach((cell, i) => {
      const opponent = columns[i]
      if (!opponent) return
      const wr = cell.match(/^\s*data-winrate="(\d+)"/)
      if (!wr) return // "--" (mirror / no data)
      const cellMatches = parseInt(
        (cell.match(/class="matches-number">([\d,]+)\s+matches/) || [])[1]?.replace(/,/g, '') || '0',
        10,
      )
      matrix[name][opponent] = { winrate: parseInt(wr[1], 10), matches: cellMatches }
    })
  }

  return { metagame, matchesAnalyzed, legends, matrix }
}

/** Throw instead of letting a login page or empty table overwrite good data. */
export function assertHasMatrix(data) {
  const cells = Object.values(data.matrix).reduce((n, row) => n + Object.keys(row).length, 0)
  if (!data.legends.length || !cells) {
    throw new Error(
      `No winrate matrix found (${data.legends.length} legends, ${cells} matchups). ` +
        'The page may be a login screen or RiftDecks may have changed its layout. Nothing was written.',
    )
  }
}

// Open the page in a visible browser and wait until the matrix is on screen,
// giving you time to log in. Loaded lazily so --file mode needs no browser.
async function fetchMatrixHtml(url, metagame) {
  const { chromium } = await import('playwright')
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false })
  try {
    const page = context.pages()[0] || (await context.newPage())
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    const deadline = Date.now() + LOGIN_TIMEOUT_MS
    let prompted = false
    while (Date.now() < deadline) {
      // Evaluation throws while the page is navigating; just try again.
      const ready = await page
        .evaluate(
          (id) =>
            location.search.includes(`metagame_id=${id}`) &&
            document.querySelectorAll('tr.item td.winrate-cell').length > 0,
          metagame,
        )
        .catch(() => false)
      if (ready) return await page.content()
      if (!prompted) {
        prompted = true
        console.error('Log in to RiftDecks in the browser window. If it does not return you to the matrix, open this URL there:')
        console.error(`  ${url}`)
      }
      await page.waitForTimeout(1000)
    }
    throw new Error(`Timed out after ${LOGIN_TIMEOUT_MS / 60_000} minutes waiting for the winrate matrix.`)
  } finally {
    await context.close()
  }
}

async function main() {
  const args = process.argv.slice(2)
  const getArg = (f, def) => {
    const i = args.indexOf(f)
    return i !== -1 ? args[i + 1] : def
  }
  const metagame = getArg('--metagame', '4')
  const relevance = getArg('--relevance', '2')
  const dateRange = getArg('--date-range', 'last_six_months')
  const file = getArg('--file', null)
  const out = getArg('--out', DEFAULT_OUT)

  let html
  if (file) {
    html = await fs.readFile(path.resolve(file), 'utf8')
  } else {
    const url = `https://riftdecks.com/stats/winrate?metagame_id=${metagame}&relevance=${relevance}&date_range=${dateRange}`
    console.error(`Opening ${url}`)
    html = await fetchMatrixHtml(url, metagame)
  }

  const data = parseWinrateMatrix(html)
  assertHasMatrix(data)
  data.source = { metagame, relevance, dateRange, scrapedAt: new Date().toISOString() }
  await fs.writeFile(path.resolve(out), JSON.stringify(data, null, 2))
  console.error(`Wrote ${out}`)
  console.log(
    `${data.metagame || 'metagame'}: ${data.legends.length} legends, ${data.matchesAnalyzed.toLocaleString()} matches analyzed`,
  )
}

if (process.argv[1] && process.argv[1].endsWith('scrape-winrate.mjs')) {
  main().catch((err) => {
    console.error(err)
    // exitCode, not exit(): exiting mid-teardown crashes Node on Windows.
    process.exitCode = 1
  })
}
