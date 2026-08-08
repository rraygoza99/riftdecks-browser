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
const LEGEND_CARDS_OUTPUT = path.join(__dirname, '../public/legend-cards.json')
const CARDS_CACHE = path.join(__dirname, '../data/deck-cards.json')
const TOURNAMENTS_CACHE = path.join(__dirname, '../data/tournament-decks.json')
const BASE = 'https://riftdecks.com'

// --- CLI args ----------------------------------------------------------
const args = process.argv.slice(2)
const getArg = (flag, def) => {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : def
}
const hasFlag = (flag) => args.includes(flag)
const MAX_PAGES = parseInt(getArg('--pages', '5'), 10)
const RELEVANCE = parseInt(getArg('--relevance', '2'), 10)
// Decks from tournaments older than this many days are pruned from the output
// to keep decks.json small. Set to 0 to disable pruning.
const MAX_AGE_DAYS = parseInt(getArg('--max-age', '45'), 10)
// Card analysis: visit individual deck pages to collect their card lists and
// aggregate them per legend into legend-cards.json. Disable with --no-cards.
const SCRAPE_CARDS = !hasFlag('--no-cards')
// How many decks to sample per legend when building the card analysis.
const CARDS_PER_LEGEND = parseInt(getArg('--cards-per-legend', '8'), 10)
// Global cap on how many *new* deck pages to fetch for cards in one run
// (cached decks don't count). Keeps each run's runtime bounded.
const MAX_CARD_DECKS = parseInt(getArg('--max-card-decks', '400'), 10)
// How many deck pages to fetch in parallel during card analysis. The single
// biggest lever on run time — raise it to go faster (bounded by the site and
// your bandwidth), lower it if you hit rate-limits/Cloudflare challenges.
const CARD_CONCURRENCY = Math.max(1, parseInt(getArg('--concurrency', '6'), 10))
// Tournaments from the last N days are always re-scraped (their standings/decks
// may still be changing); older tournaments are final and served from the
// tournament-decks cache so the list crawl skips re-visiting them every run.
// Set to 0 to always re-scrape every tournament (ignores the cache).
const RESCRAPE_DAYS = parseInt(getArg('--rescrape-days', '3'), 10)
// Chinese tournaments are included regardless of relevance via a second crawl
// over the `omni=china` listing. This controls how many of its pages to scan.
// Set to 0 to disable the China pass.
const CHINA_PAGES = parseInt(getArg('--china-pages', String(MAX_PAGES)), 10)

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

// Build a stable URL slug from a legend's display name.
function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// Remove decks whose tournament is older than `maxAgeDays` days.
// Decks with an unknown/unparseable date are kept (we can't judge their age).
function pruneOldDecks(decks, maxAgeDays) {
  if (!maxAgeDays || maxAgeDays <= 0) return decks
  const cutoff = new Date()
  cutoff.setUTCHours(0, 0, 0, 0)
  cutoff.setUTCDate(cutoff.getUTCDate() - maxAgeDays)
  return decks.filter((d) => {
    if (!d.tournamentDate) return true
    const date = new Date(`${d.tournamentDate}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date >= cutoff
  })
}

// --- Tournament deck-list cache ---------------------------------------
// Finished tournaments never change, so we cache their scraped deck lists by
// tournament id and skip re-visiting them on later runs (see RESCRAPE_DAYS).
async function loadTournamentCache() {
  try {
    return JSON.parse(await fs.readFile(TOURNAMENTS_CACHE, 'utf-8'))
  } catch {
    return {}
  }
}

function tournamentIdFromUrl(url) {
  const m = (url || '').match(/(\d+)\/?$/)
  return m ? m[1] : ''
}

// Drop cached tournaments whose date is older than `days` so the file stays
// lean (undated entries are kept — we can't judge their age).
function pruneTournamentCache(cache, days = MAX_AGE_DAYS) {
  if (!days || days <= 0) return cache
  const cutoff = Date.now() - days * 86_400_000
  for (const [id, entry] of Object.entries(cache)) {
    const dateStr = entry?.dateStr
    if (!dateStr) continue
    const t = new Date(`${dateStr}T00:00:00Z`).getTime()
    if (!Number.isNaN(t) && t < cutoff) delete cache[id]
  }
  return cache
}

// --- Card analysis helpers --------------------------------------------
async function loadDeckCardCache() {
  try {
    const raw = await fs.readFile(CARDS_CACHE, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

// Drop cache entries older than `days` so the cache file doesn't grow forever.
function pruneCardCache(cache, days = 120) {
  const cutoff = Date.now() - days * 86_400_000
  for (const [id, entry] of Object.entries(cache)) {
    const t = new Date(entry?.fetchedAt || 0).getTime()
    if (Number.isNaN(t) || t < cutoff) delete cache[id]
  }
  return cache
}

// Extract the card list from an already-loaded deck detail page.
async function extractCards(page) {
  return page
    .$$eval(
      'tr.card-list-item',
      (rows, base) =>
        rows.map((row) => {
          const type = (row.getAttribute('data-card-type') || 'other').toLowerCase()
          const quantity = parseInt(row.getAttribute('data-quantity') || '1', 10) || 1
          const imgSrc = row.getAttribute('data-image-src') || ''
          const linkEl = row.querySelector('td a[href^="/cards/"]')
          const name = (linkEl?.textContent || '').trim()
          const cardUrl = linkEl?.getAttribute('href') || ''
          const rarityEl = row.querySelector('img[src*="rarity_"]')
          const rarity = rarityEl?.getAttribute('alt') || ''
          let price = null
          const priceCell = [...row.querySelectorAll('td')]
            .map((td) => td.textContent || '')
            .find((t) => /\$/.test(t))
          if (priceCell) {
            const m = priceCell.match(/\$([\d.]+)/)
            if (m) price = parseFloat(m[1])
          }
          const runes = [...new Set(
            [...row.querySelectorAll('img[src*="rune_"]')]
              .map((im) => im.getAttribute('alt'))
              .filter(Boolean)
          )]
          return {
            name,
            cardUrl,
            type,
            quantity,
            imageSrc: imgSrc ? base + imgSrc : '',
            rarity,
            price,
            runes,
          }
        }),
      BASE
    )
    .catch(() => [])
}

// Load a deck detail page and return its cards. The context already holds
// Cloudflare clearance cookies (set during pre-warm), so deck pages almost
// never re-challenge — try the fast path first and only pay the interstitial
// wait if the card table doesn't show up.
async function fetchDeckCards(page, deckUrl) {
  await page.goto(deckUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const ok = await page
    .waitForSelector('tr.card-list-item', { timeout: 12000 })
    .then(() => true)
    .catch(() => false)
  if (!ok) {
    // Rare Cloudflare interstitial — wait for it to clear, then retry once.
    await page
      .waitForFunction(() => !document.title.toLowerCase().includes('moment'), { timeout: 15000 })
      .catch(() => {})
    await page.waitForSelector('tr.card-list-item', { timeout: 8000 }).catch(() => {})
  }
  return extractCards(page)
}

// Run `worker(item, resource)` over `items`, keeping `resources.length` tasks
// in flight — each concurrent runner owns one dedicated resource (a Page), so
// the same page is never used by two tasks at once.
async function runPoolWithResources(items, resources, worker) {
  let next = 0
  const runners = resources.map(async (resource) => {
    while (true) {
      const i = next++
      if (i >= items.length) break
      await worker(items[i], resource, i)
    }
  })
  await Promise.all(runners)
}

// Aggregate the sampled decks of one legend into per-card inclusion stats.
function aggregateLegendCards(legendName, group, chosen) {
  const slug = slugify(legendName) || slugify(group[0]?.legendSlug) || 'unknown'
  const legendTileUrl = group.find((d) => d.legendTileUrl)?.legendTileUrl || ''
  const decksSampled = chosen.length
  const cardMap = new Map()

  for (const { cards } of chosen) {
    const seenInDeck = new Set()
    for (const c of cards) {
      const key = c.cardUrl || c.name
      if (!key) continue
      if (!cardMap.has(key)) {
        cardMap.set(key, {
          name: c.name,
          cardUrl: c.cardUrl,
          imageSrc: c.imageSrc,
          type: c.type,
          rarity: c.rarity,
          price: c.price,
          runes: c.runes || [],
          decks: 0,
          copies: 0,
        })
      }
      const agg = cardMap.get(key)
      if (!seenInDeck.has(key)) {
        agg.decks += 1
        seenInDeck.add(key)
      }
      agg.copies += c.quantity
      if (agg.price == null && c.price != null) agg.price = c.price
      if (!agg.imageSrc && c.imageSrc) agg.imageSrc = c.imageSrc
    }
  }

  const cards = [...cardMap.values()]
    .map((a) => ({
      name: a.name,
      cardUrl: a.cardUrl,
      imageSrc: a.imageSrc,
      type: a.type,
      rarity: a.rarity,
      price: a.price,
      runes: a.runes,
      decks: a.decks,
      inclusionRate: a.decks / decksSampled,
      avgCopies: Math.round((a.copies / a.decks) * 100) / 100,
    }))
    .sort(
      (x, y) =>
        y.inclusionRate - x.inclusionRate ||
        y.avgCopies - x.avgCopies ||
        x.name.localeCompare(y.name)
    )

  return { legendSlug: slug, legendName, legendTileUrl, decksSampled, totalDecks: group.length, cards }
}

// Build the per-legend card analysis by sampling deck pages (cache-backed).
//
// Works in three phases so deck pages can be fetched in parallel:
//   1. Plan   — pick each legend's top-8 sample candidates and list the
//               uncached deck pages we need, popular legends first, up to the
//               global fetch budget.
//   2. Fetch  — pull those pages concurrently across the `pages` pool, writing
//               results into the cache (persisted periodically so an
//               interrupted run resumes from where it left off).
//   3. Aggregate — build per-card inclusion stats for each legend from cache.
async function buildLegendCardAnalysis(pages, decks, cache, saveCache) {
  const groups = new Map()
  for (const d of decks) {
    const key = d.legendName || slugToTitle(d.legendSlug) || 'Unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(d)
  }

  // Popular legends first so they get priority on the fetch budget.
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  // Only analyse top-8 finishers so the card lists reflect competitive,
  // complete decks. Prefer the best-placed, most recent as samples.
  const legendCandidates = new Map()
  for (const [legendName, group] of ordered) {
    const candidates = [...group]
      .filter((d) => d.standing <= 8)
      .sort((a, b) => {
        if (a.standing !== b.standing) return a.standing - b.standing
        const da = a.tournamentDate ? Date.parse(a.tournamentDate) : 0
        const db = b.tournamentDate ? Date.parse(b.tournamentDate) : 0
        return db - da
      })
    legendCandidates.set(legendName, candidates)
  }

  // --- Phase 1: plan which uncached deck pages to fetch --------------------
  // Reuse cached samples first. A legend only needs *new* fetches when it has
  // fewer than CARDS_PER_LEGEND decks already in the cache. Without this, the
  // sampler walks candidates newest-first and re-fetches a fresh batch of the
  // latest (always-uncached) decks every run, ignoring the still-valid cached
  // samples that slipped to positions 9+. That made each run re-scan hundreds
  // of decks instead of only the genuinely new ones.
  let budget = MAX_CARD_DECKS
  const toFetch = []
  const queued = new Set()
  for (const [legendName] of ordered) {
    const candidates = legendCandidates.get(legendName)
    const cachedCount = candidates.filter((d) => cache[d.deckId]?.cards?.length).length
    let need = CARDS_PER_LEGEND - cachedCount
    if (need <= 0) continue // already have a full sample from cache — no fetch
    for (const d of candidates) {
      if (need <= 0) break
      if (cache[d.deckId]?.cards?.length) continue
      if (budget <= 0) break
      if (!queued.has(d.deckId)) {
        queued.add(d.deckId)
        toFetch.push(d)
        budget--
      }
      need--
    }
  }

  // --- Phase 2: fetch the planned pages in parallel ------------------------
  let fetched = 0
  let failed = 0
  // Serialize cache writes so parallel workers never clobber the file.
  let saveChain = Promise.resolve()
  const scheduleSave = () => {
    if (saveCache) saveChain = saveChain.then(() => saveCache()).catch(() => {})
  }

  if (toFetch.length) {
    console.log(`  Fetching ${toFetch.length} new deck page(s) with concurrency ${pages.length}…`)
    await runPoolWithResources(toFetch, pages, async (d, page) => {
      const cards = await fetchDeckCards(page, `${BASE}${d.deckUrl}`).catch(() => null)
      if (cards && cards.length) {
        cache[d.deckId] = { cards, fetchedAt: new Date().toISOString() }
        fetched++
        // Persist every so often so progress survives an interruption/crash.
        if (fetched % 10 === 0) scheduleSave()
      } else {
        failed++
      }
      const done = fetched + failed
      if (done % 25 === 0 || done === toFetch.length) {
        console.log(`    …${done}/${toFetch.length} fetched (${failed} empty)`)
      }
    })
    await saveChain
  }

  // --- Phase 3: aggregate per-legend stats from the cache ------------------
  let usedCache = 0
  let usedFetched = 0
  const legends = []
  for (const [legendName, group] of ordered) {
    const chosen = []
    for (const d of legendCandidates.get(legendName)) {
      if (chosen.length >= CARDS_PER_LEGEND) break
      const entry = cache[d.deckId]
      if (!entry?.cards?.length) continue
      chosen.push({ deck: d, cards: entry.cards })
      if (queued.has(d.deckId)) usedFetched++
      else usedCache++
    }
    if (chosen.length) {
      legends.push(aggregateLegendCards(legendName, group, chosen))
    }
  }

  legends.sort((a, b) => b.totalDecks - a.totalDecks)
  console.log(
    `  Card analysis: ${fetched} deck(s) fetched (${failed} empty), ${usedCache} reused from cache, ${legends.length} legends.`
  )
  return legends
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

  // Skip heavy resources we never read (images, media, fonts). We only extract
  // text and element attributes, so aborting these dramatically speeds up every
  // page load — especially the image-heavy deck detail pages.
  await context.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (type === 'image' || type === 'media' || type === 'font') return route.abort()
    return route.continue()
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

  // Load the tournament deck-list cache so finished tournaments are reused
  // instead of re-scraped every run. Persist it as we go so an interrupted run
  // keeps its progress.
  const tournamentCache = pruneTournamentCache(await loadTournamentCache())
  await fs.mkdir(path.dirname(TOURNAMENTS_CACHE), { recursive: true })
  const saveTournamentCache = () =>
    fs.writeFile(TOURNAMENTS_CACHE, JSON.stringify(tournamentCache), 'utf-8')
  const rescrapeCutoff =
    RESCRAPE_DAYS > 0 ? Date.now() - RESCRAPE_DAYS * 86_400_000 : Infinity
  const stats = { scraped: 0, reused: 0 }

  // Crawl a tournament listing page-by-page, scraping each tournament's decks
  // into `allDecks`. `listUrlFor(pageNum)` builds the listing URL so we can run
  // the same crawl over different filters (e.g. relevance vs. the China list).
  const crawlList = async (listUrlFor, maxPages, label) => {
    let pageNum = 1
    while (pageNum <= maxPages) {
      const listUrl = listUrlFor(pageNum)
      console.log(`[${label} ${pageNum}/${maxPages}] Fetching tournament list: ${listUrl}`)
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
          // "Meta" column: e.g. "Vendetta Constructed" rendered as two badges —
          // the set ("Vendetta"/"Unleashed") followed by the format ("Constructed").
          const metaCell = row.querySelector('td:nth-child(2)')
          const metaBadges = metaCell
            ? [...metaCell.querySelectorAll('span')]
                .map((s) => s.textContent.trim())
                .filter(Boolean)
            : []
          return {
            url,
            name: nameEl?.textContent.trim() || '',
            dateStr: dateEl?.textContent.trim() || '',
            meta: metaCell?.textContent.replace(/\s+/g, ' ').trim() || '',
            metaSet: metaBadges[0] || '',
            metaFormat: metaBadges[1] || '',
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
        const tournId = tournamentIdFromUrl(r.url)
        const tDate = r.dateStr ? new Date(`${r.dateStr}T00:00:00Z`).getTime() : NaN
        // Recent (or undated) tournaments may still be changing — always re-scrape
        // them. Older, finished tournaments are served from cache when present.
        const isRecent = Number.isNaN(tDate) || tDate >= rescrapeCutoff
        const cached = tournId ? tournamentCache[tournId] : null

        let rawDecks
        let totalPlayers
        if (cached && !isRecent) {
          rawDecks = cached.decks || []
          totalPlayers = cached.totalPlayers ?? null
          stats.reused++
        } else {
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
          totalPlayers = await page.evaluate(() => {
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

          rawDecks = await page.$$eval(
            'tr[id^="desktop-deck-"]',
            (rows, base) =>
              rows.map((row) => {
                const deckUrl = row.getAttribute('data-href') || ''
                const rankEl = row.querySelector('td:first-child strong')
                const deckLinkEl = row.querySelector('td:nth-child(3) a')
                const avatarEl = row.querySelector('td:nth-child(2) span.avatar[title]')

                const rankText = rankEl?.textContent.trim() || '99'
                const standing = parseInt(rankText.replace(/\D/g, ''), 10) || 99
                const deckName = deckLinkEl?.textContent.trim() || 'Unknown'
                const legendName = avatarEl?.getAttribute('title')?.trim() || null

                const style = avatarEl?.getAttribute('style') || ''
                const bgMatch = style.match(/url\(['"']?([^'"')]+)['"']?\)/)
                const legendTileUrl = bgMatch ? `${base}${bgMatch[1]}` : ''

                // Price lives in a green span like
                // <span class="text-green small">$323.13</span>, but the meta badge
                // (e.g. "Vendetta") is ALSO a green span — so match on the dollar
                // amount rather than relying on the .text-green class or its position.
                const priceText = [...row.querySelectorAll('span, td')]
                  .map((el) => el.textContent.trim())
                  .find((t) => /^\$[\d,]+(?:\.\d+)?$/.test(t)) || ''
                const price = priceText ? parseFloat(priceText.replace(/[^\d.]/g, '')) : null

                const fullDeckUrl = deckUrl.startsWith('http') ? deckUrl : `${base}${deckUrl}`
                return { deckUrl: fullDeckUrl, standing, deckName, legendName, legendTileUrl, price }
              }),
            BASE
          )

          if (rawDecks.length > 0) {
            console.log(`      ${rawDecks.length} decks found`)
          }

          // Cache finished/complete tournaments so later runs skip them.
          if (tournId && rawDecks.length) {
            tournamentCache[tournId] = {
              decks: rawDecks,
              totalPlayers,
              name: r.name || '',
              dateStr: r.dateStr || null,
              scrapedAt: new Date().toISOString(),
            }
            stats.scraped++
            if (stats.scraped % 20 === 0) await saveTournamentCache().catch(() => {})
          }
        }

        for (const d of rawDecks) {
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
            meta: r.meta || null,
            metaSet: r.metaSet || null,
            metaFormat: r.metaFormat || null,
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
  }

  // Main pass: relevance-filtered tournaments.
  await crawlList(
    (n) => `${BASE}/riftbound-tournaments?relevance=${RELEVANCE}&page=${n}`,
    MAX_PAGES,
    'main'
  )

  // China pass: include Chinese tournaments regardless of relevance. Dedupe by
  // deck id (handled above) means overlap with the main pass is skipped.
  if (CHINA_PAGES > 0) {
    const before = allDecks.length
    await crawlList(
      (n) => `${BASE}/riftbound-tournaments?omni=china&relevance=0&page=${n}`,
      CHINA_PAGES,
      'china'
    )
    console.log(`China pass added ${allDecks.length - before} new deck(s).`)
  }

  // Persist the tournament deck-list cache for the next run.
  await saveTournamentCache().catch(() => {})
  console.log(
    `\nTournaments: ${stats.scraped} scraped, ${stats.reused} reused from cache.`
  )

  // Drop stale decks so decks.json stays lean
  const dated = pruneOldDecks(allDecks, MAX_AGE_DAYS)
  const agePruned = allDecks.length - dated.length
  if (agePruned > 0) {
    console.log(`\nPruned ${agePruned} deck(s) older than ${MAX_AGE_DAYS} days.`)
  }

  // Drop decks whose total value is under $1 — these are almost always
  // incomplete/placeholder lists rather than real tournament decks.
  const decks = dated.filter((d) => d.price == null || d.price >= 1)
  const pricePruned = dated.length - decks.length
  if (pricePruned > 0) {
    console.log(`Pruned ${pricePruned} deck(s) with total value under $1.`)
  }

  // Per-legend card analysis (visits individual deck pages, cache-backed)
  let legendCards = null
  if (SCRAPE_CARDS && decks.length) {
    console.log(
      `\nBuilding per-legend card analysis (≤${CARDS_PER_LEGEND}/legend, budget ${MAX_CARD_DECKS}, concurrency ${CARD_CONCURRENCY})…`
    )
    const cache = pruneCardCache(await loadDeckCardCache())
    await fs.mkdir(path.dirname(CARDS_CACHE), { recursive: true })
    const saveCache = () => fs.writeFile(CARDS_CACHE, JSON.stringify(cache), 'utf-8')
    // Open a pool of pages (reusing the main one) to fetch deck pages in parallel.
    const pages = [page]
    for (let i = 1; i < CARD_CONCURRENCY; i++) pages.push(await context.newPage())
    legendCards = await buildLegendCardAnalysis(pages, decks, cache, saveCache)
    for (let i = 1; i < pages.length; i++) await pages[i].close()
    await saveCache()
  }

  await browser.close()

  // Write deck output
  const output = {
    scrapedAt: new Date().toISOString(),
    relevance: RELEVANCE,
    deckCount: decks.length,
    decks,
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\nDone. Saved ${decks.length} decks → ${OUTPUT}`)

  // Write legend card analysis
  if (legendCards) {
    const legendOutput = {
      generatedAt: new Date().toISOString(),
      cardsPerLegend: CARDS_PER_LEGEND,
      legendCount: legendCards.length,
      legends: legendCards,
    }
    await fs.writeFile(LEGEND_CARDS_OUTPUT, JSON.stringify(legendOutput, null, 2), 'utf-8')
    console.log(`Saved card analysis for ${legendCards.length} legends → ${LEGEND_CARDS_OUTPUT}`)
  }
}

main().catch((err) => {
  console.error('Scrape failed:', err)
  process.exit(1)
})
