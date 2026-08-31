/**
 * Headless, multithreaded Monte Carlo goldfish simulator.
 *
 * Shards N iterations across worker threads (one per CPU core), runs the
 * simulation core in each, merges the partial aggregates, and writes a JSON
 * consistency report.
 *
 * Usage:
 *   node scripts/goldfish.mjs                         # example deck, 10k iters
 *   node scripts/goldfish.mjs --iterations 50000      # more samples
 *   node scripts/goldfish.mjs --file path/deck.html   # a local deck page
 *   node scripts/goldfish.mjs --deck path/deck.json   # a pre-built deck definition
 *   node scripts/goldfish.mjs --threads 4 --out report.json
 *   node scripts/goldfish.mjs <deck-url>              # fetch a live deck
 *
 * Card attributes (energy cost, type, tags) are pulled on demand from the
 * riftcodex API and cached in data/card-attributes.json. Pass --no-api to skip
 * the network and fall back to a synthesised cost curve; --save-deck writes the
 * resolved deck definition for reuse.
 */

import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import { parseDeckHtml } from './scrape-deck.mjs'
import { enrichDeckDef } from './cardApi.mjs'
import {
  runChunk,
  mergeAggregates,
  finalizeReport,
  resolveConfig,
} from '../src/simulation/goldfish.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const EXAMPLE = path.join(__dirname, 'deck-example.html')
const CARD_CACHE = path.join(__dirname, '../data/card-attributes.json')

function curveHistogram(deckDef) {
  const hist = {}
  for (const c of deckDef.cards) hist[c.cost] = (hist[c.cost] || 0) + c.count
  return Object.fromEntries(Object.entries(hist).sort((a, b) => a[0] - b[0]))
}

// --- Worker role -------------------------------------------------------

if (!isMainThread) {
  const { deckDef, config, count, seed } = workerData
  const agg = runChunk(deckDef, config, count, seed)
  parentPort.postMessage(agg)
}

// --- Main orchestration ------------------------------------------------

function spawnWorker(deckDef, config, count, seed) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { deckDef, config, count, seed } })
    worker.once('message', resolve)
    worker.once('error', reject)
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`))
    })
  })
}

async function loadDeckDef(args, getArg, useApi) {
  const deckJson = getArg('--deck')
  if (deckJson) {
    // A pre-built deck definition already carries real costs; use as-is.
    const raw = JSON.parse(await fs.readFile(path.resolve(deckJson), 'utf8'))
    if (raw.cards) return raw
    return enrichDeckDef(raw, { cachePath: CARD_CACHE, useApi })
  }
  const urlArg = args.find((a) => a.startsWith('http'))
  let html
  if (urlArg) {
    const { chromium } = await import('playwright-extra')
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth')
    chromium.use(StealthPlugin())
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.goto(urlArg, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForSelector('tr.card-list-item', { timeout: 15000 }).catch(() => {})
      html = await page.content()
    } finally {
      await browser.close()
    }
  } else {
    const file = getArg('--file') ? path.resolve(getArg('--file')) : EXAMPLE
    html = await fs.readFile(file, 'utf8')
  }
  return enrichDeckDef(parseDeckHtml(html), { cachePath: CARD_CACHE, useApi })
}

async function main() {
  const args = process.argv.slice(2)
  const getArg = (f) => {
    const i = args.indexOf(f)
    return i !== -1 ? args[i + 1] : null
  }
  const iterations = parseInt(getArg('--iterations') || '10000', 10)
  const threads = Math.max(1, parseInt(getArg('--threads') || String(os.cpus().length), 10))
  const outPath = getArg('--out')
  const useApi = !args.includes('--no-api')
  const saveDeck = getArg('--save-deck')

  const deckDef = await loadDeckDef(args, getArg, useApi)
  if (saveDeck) {
    await fs.writeFile(path.resolve(saveDeck), JSON.stringify(deckDef, null, 2))
    console.error(`Wrote resolved deck to ${saveDeck}`)
  }
  const config = resolveConfig({ iterations })

  // Split iterations across workers; the last worker absorbs the remainder.
  const base = Math.floor(iterations / threads)
  const counts = new Array(threads).fill(base)
  counts[threads - 1] += iterations - base * threads

  const start = Date.now()
  const partials = await Promise.all(
    counts.map((count, i) => spawnWorker(deckDef, config, count, 0x9e3779b9 ^ (i * 0x01000193))),
  )
  const merged = mergeAggregates(partials)
  const runtimeMs = Date.now() - start

  const report = finalizeReport(merged, {
    deckMeta: { ...deckDef.meta, curve: curveHistogram(deckDef) },
    config,
    runtimeMs,
    threadsUsed: threads,
  })

  const json = JSON.stringify(report, null, 2)
  if (outPath) {
    await fs.writeFile(path.resolve(outPath), json)
    console.error(`Wrote ${outPath}`)
  }

  // Console summary.
  const m = report.metrics
  console.log(`\nDeck: ${report.deck.title ?? 'Untitled'} (${report.deck.legendName ?? '—'})`)
  console.log(`Curve: ${JSON.stringify(report.deck.curve)}  [${report.deck.costSource} costs]`)
  console.log(`Iterations: ${report.config.iterations}  Threads: ${threads}  Time: ${runtimeMs}ms`)
  console.log('-'.repeat(52))
  console.log(`Brick rate (no T1/T2 play):  ${m.brickRate}%`)
  console.log(`Curve efficiency (T1-T4):    ${m.curveEfficiency}%`)
  console.log(`  by turn: ${JSON.stringify(m.curveEfficiencyByTurn)}`)
  console.log(`Turn whiff rate:             ${JSON.stringify(m.turnWhiffRate)}`)
  console.log(`Avg cards played by turn:    ${JSON.stringify(m.avgCardsPlayedByTurn)}`)
  console.log(`Avg floated energy by turn:  ${JSON.stringify(m.avgFloatByTurn)}`)
  console.log(`Avg mulligans:               ${m.avgMulligans}`)
  console.log('Turn-N consistency:')
  for (const [name, t] of Object.entries(m.thresholds)) {
    console.log(`  ${name}: ${t.probability}%  (${t.description})`)
  }
  if (!outPath) console.log(`\n(Use --out report.json to save the full JSON report.)`)
}

if (isMainThread) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
