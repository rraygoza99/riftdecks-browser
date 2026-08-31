// Champion Legend "Conversion Rate" analytics.
//
// Turns scraped tournament placements into a funnel per Legend and derives
// conversion / drop-off metrics plus an archetype tier classification.
//
// Input data model:
//   Tournament     { id, name, playerCount, format, date }
//   PlacementEntry { tournamentId, player, legendName, placement, decklist }
//     placement is the best position reached (1, 2, 4, 8, 16, 32, ...).
//
// Everything here is pure and framework-agnostic so it can run inside the
// Vite app or from a Node script.

// Cut brackets ordered widest -> narrowest. A placement `p` reached bracket
// `size` when `p <= size`.
export const BRACKETS = [
  { size: 32, label: 'Top 32' },
  { size: 16, label: 'Top 16' },
  { size: 8, label: 'Top 8' },
  { size: 4, label: 'Top 4' },
  { size: 2, label: 'Finals' },
  { size: 1, label: '1st Place' },
]

// A Top Cut appearance is anything inside the widest bracket.
const TOP_CUT_SIZE = BRACKETS[0].size
// "Converted" means the run turned into a Top 4 / Finals / 1st Place finish.
const CONVERSION_SIZE = 4

function round(value, digits = 1) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

function pct(part, whole) {
  return whole > 0 ? round((part / whole) * 100) : 0
}

function mean(values) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

// Build the reached-count funnel for a single legend's placement list.
// reached[size] = how many entries finished at position <= size.
function buildFunnel(placements) {
  const reached = {}
  for (const { size } of BRACKETS) reached[size] = 0
  for (const p of placements) {
    for (const { size } of BRACKETS) {
      if (p <= size) reached[size] += 1
    }
  }
  return reached
}

// Find the stage transition where the archetype sheds the most runs.
// Returns the widest bracket on ties so "fails early" beats "fails late".
function findDropOff(reached) {
  let worst = null
  for (let i = 0; i < BRACKETS.length - 1; i++) {
    const from = BRACKETS[i]
    const to = BRACKETS[i + 1]
    const dropped = reached[from.size] - reached[to.size]
    const dropRate = pct(dropped, reached[from.size])
    if (!worst || dropped > worst.dropped) {
      worst = { stage: `${from.label} \u2192 ${to.label}`, dropped, dropRate }
    }
  }
  return worst
}

// Assign an archetype tier from presence + finishing metrics. Thresholds are
// relative to the dataset (dataset means) by default so the labels stay
// meaningful regardless of sample size, but can be overridden.
function classify(row, thresholds) {
  const { presence, firstPlaceRate, conversionRate } = row
  const highPresence = presence >= thresholds.presence
  const highFirst = firstPlaceRate >= thresholds.firstPlaceRate
  const highConversion = conversionRate >= thresholds.conversionRate

  if (highPresence && highFirst) return 'Closer'
  if (highPresence && !highFirst) return 'Gatekeeper'
  if (!highPresence && highConversion) return 'Fringe / Dark Horse'
  return 'Unproven'
}

/**
 * Analyze conversion rates for every Legend in a placement dataset.
 *
 * @param {Array} placements - PlacementEntry[] (tournamentId, legendName, placement, ...).
 * @param {Object} [options]
 * @param {Array}  [options.tournaments] - Tournament[]; enables format filtering.
 * @param {string} [options.format] - Only include placements from tournaments of this format.
 * @param {number} [options.minTopCut=1] - Ignore legends below this Top Cut sample size.
 * @param {Object} [options.thresholds] - Override { presence, firstPlaceRate, conversionRate }.
 * @returns {{ summary: Array, tiers: Object, thresholds: Object, table: string, json: string }}
 */
export function analyzeConversionRates(placements, options = {}) {
  const { tournaments = [], format = null, minTopCut = 1, thresholds: thresholdOverrides = {} } = options

  // Optional format filter based on the companion Tournament records.
  let entries = placements
  if (format) {
    const allowed = new Set(
      tournaments.filter((t) => t.format === format).map((t) => String(t.id)),
    )
    entries = entries.filter((e) => allowed.has(String(e.tournamentId)))
  }

  // Group Top Cut placements by legend.
  const byLegend = new Map()
  for (const e of entries) {
    const placement = Number(e.placement)
    if (!e.legendName || !Number.isFinite(placement) || placement > TOP_CUT_SIZE) continue
    if (!byLegend.has(e.legendName)) byLegend.set(e.legendName, [])
    byLegend.get(e.legendName).push(placement)
  }

  // First pass: raw funnel + rates per legend.
  const rows = []
  for (const [legendName, placementList] of byLegend) {
    const reached = buildFunnel(placementList)
    const topCut = reached[TOP_CUT_SIZE]
    if (topCut < minTopCut) continue

    rows.push({
      legendName,
      topCutAppearances: topCut,
      presence: topCut,
      converted: reached[CONVERSION_SIZE],
      finals: reached[2],
      firstPlace: reached[1],
      conversionRate: pct(reached[CONVERSION_SIZE], topCut),
      finalsRate: pct(reached[2], topCut),
      firstPlaceRate: pct(reached[1], topCut),
      dropOff: findDropOff(reached),
      funnel: BRACKETS.map(({ size, label }) => ({ label, reached: reached[size] })),
    })
  }

  // Dataset-relative thresholds (means), overridable by the caller.
  const thresholds = {
    presence: mean(rows.map((r) => r.presence)),
    firstPlaceRate: mean(rows.map((r) => r.firstPlaceRate)),
    conversionRate: mean(rows.map((r) => r.conversionRate)),
    ...thresholdOverrides,
  }

  // Second pass: tier classification.
  for (const row of rows) row.tier = classify(row, thresholds)

  // Sort by conversion rate, then finishing quality, then sample size.
  rows.sort(
    (a, b) =>
      b.conversionRate - a.conversionRate ||
      b.firstPlaceRate - a.firstPlaceRate ||
      b.topCutAppearances - a.topCutAppearances,
  )

  const tiers = rows.reduce((acc, r) => {
    ;(acc[r.tier] ||= []).push(r.legendName)
    return acc
  }, {})

  return {
    summary: rows,
    tiers,
    thresholds,
    table: formatTable(rows),
    json: JSON.stringify({ thresholds, tiers, summary: rows }, null, 2),
  }
}

// Render the summary as a fixed-width console table.
export function formatTable(rows) {
  const columns = [
    { key: 'legendName', header: 'Legend', width: 30, align: 'left' },
    { key: 'topCutAppearances', header: 'TopCut', width: 6, align: 'right' },
    { key: 'conversionRate', header: 'Conv%', width: 6, align: 'right' },
    { key: 'firstPlaceRate', header: '1st%', width: 6, align: 'right' },
    { key: 'dropStage', header: 'Drop-off Stage', width: 22, align: 'left' },
    { key: 'tier', header: 'Tier', width: 20, align: 'left' },
  ]

  const cell = (value, width, align) => {
    let s = String(value ?? '')
    if (s.length > width) s = s.slice(0, width - 1) + '\u2026'
    return align === 'right' ? s.padStart(width) : s.padEnd(width)
  }

  const header = columns.map((c) => cell(c.header, c.width, c.align)).join('  ')
  const divider = columns.map((c) => '-'.repeat(c.width)).join('  ')
  const body = rows.map((r) => {
    const view = { ...r, dropStage: r.dropOff ? r.dropOff.stage : '\u2014' }
    return columns.map((c) => cell(view[c.key], c.width, c.align)).join('  ')
  })

  return [header, divider, ...body].join('\n')
}

// Adapter: convert the repo's scraped tournament-decks shape into
// PlacementEntry[]. Scraped decks expose `standing` + `legendName` and are
// keyed by tournament id in data/tournament-decks.json.
export function placementsFromScrapedDecks(scraped) {
  const out = []
  const tournaments = Array.isArray(scraped) ? scraped : Object.entries(scraped)
  for (const item of tournaments) {
    const [tournamentId, record] = Array.isArray(scraped) ? [item.id ?? item.tournamentId, item] : item
    const decks = record.decks || []
    for (const d of decks) {
      out.push({
        tournamentId: String(tournamentId),
        player: d.player ?? d.deckName ?? null,
        legendName: d.legendName,
        placement: Number(d.standing ?? d.placement),
        decklist: d.deckUrl ?? d.decklist ?? null,
      })
    }
  }
  return out
}
