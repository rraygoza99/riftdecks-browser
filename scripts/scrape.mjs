/**
 * riftdecks-browser scrape script
 *
 * Uses Playwright (real Chromium) to bypass Cloudflare and scrape
 * tournament deck data from riftdecks.com, then writes the result to
 * public/riftdecks-data.json which the React app reads as a static asset.
 *
 * Usage:
 *   npm run scrape                  # competitive, 5 pages
 *   npm run scrape -- --pages 10   # competitive, 10 pages
 *   npm run scrape -- --relevance 0 --pages 3  # all events, 3 pages
 */

import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

chromium.use(StealthPlugin())

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUTPUT = path.join(__dirname, '../public/decks.json')
const BASE = 'https://riftdecks.com'

// --- CLI args ----------------------------------------------------------
const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def
}
const MAX_PAGES = parseInt(getArg('--pages', '5'), 10)
const RELEVANCE = parseInt(getArg('--relevance', '2'), 10)

// --- Helpers -----------------------------------------------------------
function legendSlugFromDeckUrl(deckUrl) {
  const slug = (deckUrl || '').split('/').pop() || ''
  return slug.replace(/^deck-/, '').replace(/-\d+$/, '')
}

function deckIdFromUrl(deckUrl) {
  const m = (deckUrl || '').match(/(\d+)$/)
  return m ? m[1] : ''
}

function slugToTitle(slug) {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// --- Main --------------------------------------------------------------
async function main() {
  console.log(`\nRiftDecks scraper — relevance=${RELEVANCE}, maxPages=${MAX_PAGES}`)
  console.log(`Output → ${OUTPUT}\n`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  // Pre-warm: visit homepage so Cloudflare sets clearance cookies
  console.log('Pre-warming Cloudflare session…')
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 })
  // Wait for Cloudflare challenge to resolve (title becomes the real page title)
  await page.waitForFunction(
    () => !document.title.toLowerCase().includes('moment'),
    { timeout: 20000 }
  ).catch(() => console.warn('  Cloudflare challenge may not have resolved yet'))
  await sleep(1500)
  console.log(`  title: ${await page.title()}\n`)

  const allDecks = []
  let pageNum = 1

  while (pageNum <= MAX_PAGES) {
    const listUrl = `${BASE}/riftbound-tournaments?relevance=${RELEVANCE}&page=${pageNum}`
    console.log(`[${pageNum}/${MAX_PAGES}] Fetching tournament list: ${listUrl}`)
    await page.goto(listUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForFunction(
      () => !document.title.toLowerCase().includes('moment'),
      { timeout: 15000 }
    ).catch(() => {})
    // Wait for tournament rows to appear (or timeout gracefully)
    await page.waitForSelector('tr[data-href]', { timeout: 10000 }).catch(() => {})

    // Collect tournament rows — deduplicate by URL (page renders desktop+mobile duplicates)
    const rawRows = await page.$$eval('tr[data-href]', (rows) =>
      rows.map((row) => {
        const url = row.getAttribute('data-href') || ''
        const nameEl = row.querySelector('td:nth-child(3) a')
        const dateEl = row.querySelector('td:first-child b')
        return {
          url,
          name: nameEl?.textContent.trim() || '',
          dateStr: dateEl?.textContent.trim() || '',
        }
      })
    )
    // Keep first occurrence of each URL; prefer entries that have a name
    const seen = new Map()
    for (const r of rawRows) {
      if (!r.url) continue
      if (!seen.has(r.url) || (!seen.get(r.url).name && r.name)) {
        seen.set(r.url, r)
      }
    }
    const tournamentRows = Array.from(seen.values())

    if (!tournamentRows.length) {
      console.log('  No tournament rows found — stopping.')
      break
    }

    // Check for a next-page link BEFORE navigating away from the list page
    const hasNext = await page.$('li.page-item a[rel="next"]').then((el) => !!el)

    // Fetch each tournament's deck list
    for (const r of tournamentRows) {
      if (!r.url) continue
      const tournUrl = r.url.startsWith('http') ? r.url : `${BASE}${r.url}`
      console.log(`    → ${(r.name || '(no name)').slice(0, 60)}`)

      await page.goto(tournUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      // Wait for Cloudflare challenge to resolve
      await page.waitForFunction(
        () => !document.title.toLowerCase().includes('moment'),
        { timeout: 20000 }
      ).catch(() => {})
      await sleep(500)

      // Extract total player count from the pagination summary text
      // e.g. "Page 1 of 1, showing 44 record(s) out of 44 total"
      const totalPlayers = await page.evaluate(() => {
        const allEls = [...document.querySelectorAll('*')]
        const el = allEls.find(e => /showing\s+\d+\s+record/i.test(e.textContent) && e.children.length === 0)
        if (el) {
          const m = el.textContent.match(/out of (\d+) total/i)
          if (m) return parseInt(m[1], 10)
        }
        // Fallback: count desktop deck rows
        const rows = document.querySelectorAll('tr[id^="desktop-deck-"]')
        return rows.length || null
      }).catch(() => null)

      const decks = await page.$$eval(
        'tr[id^="desktop-deck-"]',
        (rows, base) =>
          rows.map((row) => {
            const deckUrl = row.getAttribute('data-href') || ''
            const rankEl = row.querySelector('td:first-child strong')
            const deckLinkEl = row.querySelector('td:nth-child(3) a')
            const avatarEl = row.querySelector('td:nth-child(2) span.avatar[title]')
            const priceEl = row.querySelector('td.text-end span.text-green')
                         || row.querySelector('span.text-green')

            const rankText = rankEl?.textContent.trim() || '99'
            const standing = parseInt(rankText.replace(/\D/g, ''), 10) || 99
            const deckName = deckLinkEl?.textContent.trim() || 'Unknown'
            const legendName = avatarEl?.getAttribute('title')?.trim() || null

            const style = avatarEl?.getAttribute('style') || ''
            const bgMatch = style.match(/url\(['"']?([^'"')]+)['"']?\)/)
            const legendTileUrl = bgMatch ? `${base}${bgMatch[1]}` : ''

            const priceText = (priceEl?.textContent.trim() || '').replace(/[^\d.]/g, '')
            const price = priceText ? parseFloat(priceText) : null

            const fullDeckUrl = deckUrl.startsWith('http') ? deckUrl : `${base}${deckUrl}`
            return { deckUrl: fullDeckUrl, standing, deckName, legendName, legendTileUrl, price }
          }),
        BASE
      )

      if (decks.length > 0) {
        console.log(`      ${decks.length} decks found`)
      }

      for (const d of decks) {
        if (!d.deckUrl) continue
        const deckId = deckIdFromUrl(d.deckUrl)
        if (!deckId || allDecks.some((x) => x.id === deckId)) continue // deduplicate
        const slug = legendSlugFromDeckUrl(d.deckUrl)
        allDecks.push({
          id: deckId,
          deckId,
          deckName: d.deckName,
          deckUrl: d.deckUrl.replace(BASE, ''),
          legendSlug: slug,
          legendName: d.legendName || slugToTitle(slug),
          legendTileUrl: d.legendTileUrl,
          price: d.price,
          standing: d.standing,
          totalPlayers,
          tournamentName: r.name || 'Unknown',
          tournamentDate: r.dateStr || null,
        })
      }
    }

    // Check for next page was done before navigating away from list page (see above)
    if (!hasNext) {
      console.log('  No more pages.')
      break
    }
    pageNum++
  }

  await browser.close()

  // Write output
  const output = {
    scrapedAt: new Date().toISOString(),
    relevance: RELEVANCE,
    deckCount: allDecks.length,
    decks: allDecks,
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\nDone. Saved ${allDecks.length} decks → ${OUTPUT}`)
}

main().catch((err) => {
  console.error('Scrape failed:', err)
  process.exit(1)
})
