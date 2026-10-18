// Card-level deckbuilding analytics over per-deck card lists
// (public/deck-cards.json). Pure functions, shared by the Legends pages, the
// deck browser's variant filter and the Consistency page.
//
// An "entry" is { deck, list } where deck is a decks.json record and list is
// a parsed DeckList (see parseDeckCards).
import {
  MIN_SAMPLE, twoProportionTest, wilsonInterval, weightedJaccard, seededRng, median,
} from '../stats/stats.js'

export const TOP_CUT = 8
export const isTop8 = (deck) => deck.standing != null && deck.standing <= TOP_CUT

// Deck-building rules as observed in the scraped lists (and the simulator):
// 40-card main deck including the chosen champion, 12-card rune deck,
// 3 battlefields, max 3 copies of a card. Sideboard size follows the pool's
// most common size (8 in most lists, 10 in some).
export const RULES = { mainSize: 40, runeSize: 12, battlefields: 3, maxCopies: 3, defaultSideboard: 8 }

const MAIN_TYPES = new Set(['champion', 'unit', 'gear', 'spell', 'other'])

/**
 * Parse the compact export into card info + per-deck lists.
 * DeckList = { legend, champion, main: Map<name,qty>, runes, battlefields, sideboard }
 */
export function parseDeckCards(raw) {
  const info = new Map()
  const lists = new Map()
  if (!raw?.cards || !raw?.decks) return { info, lists, generatedAt: null }
  const cards = raw.cards
  for (const c of cards) {
    const section = sectionOf(c.type)
    const key = infoKey(section, c.name)
    const prev = info.get(key)
    // Prefer plain main-deck rows over champion/sideboard rows of the same
    // card (their type says where it sits, not what it is).
    if (!prev || rowRank(c.type) < rowRank(prev.type)) {
      info.set(key, {
        name: c.name,
        section,
        type: c.type,
        role: roleOf(c),
        energy: c.energy ?? null,
        price: c.price ?? null,
        img: c.img || '',
        cardUrl: c.cardUrl || '',
        rarity: c.rarity || '',
        domain: c.domain || [],
        set: c.set || null,
      })
    } else if (prev.price == null && c.price != null) prev.price = c.price
  }
  for (const [deckId, rows] of Object.entries(raw.decks)) {
    const list = { legend: null, champion: null, main: new Map(), runes: new Map(), battlefields: new Map(), sideboard: new Map() }
    for (const [i, qty] of rows) {
      const c = cards[i]
      if (!c) continue
      const section = sectionOf(c.type)
      if (section === 'legend') {
        list.legend = c.name
        continue
      }
      if (c.type === 'champion') list.champion = c.name
      const m = list[section]
      m.set(c.name, (m.get(c.name) || 0) + qty)
    }
    lists.set(String(deckId), list)
  }
  return { info, lists, generatedAt: raw.generatedAt || null }
}

const rowRank = (type) => (type === 'sideboard' ? 2 : type === 'champion' ? 1 : 0)

export function sectionOf(type) {
  if (type === 'legend') return 'legend'
  if (type === 'runes') return 'runes'
  if (type === 'battlefields') return 'battlefields'
  if (type === 'sideboard') return 'sideboard'
  return 'main'
}

export function infoKey(section, name) {
  return `${section === 'sideboard' ? 'main' : section}:${name}`
}

// Card role for budget substitutes: riftcodex type when known, else the
// deck section type.
function roleOf(c) {
  const t = (c.cardType || '').toLowerCase()
  if (t) return t
  return MAIN_TYPES.has(c.type) ? (c.type === 'champion' ? 'unit' : c.type) : c.type
}

export function cardInfo(info, section, name) {
  return info.get(infoKey(section, name)) || { name, section, type: section, role: section, energy: null, price: null }
}

/** Join decks with their card lists. Decks without a list are dropped. */
export function entriesFor(decks, lists) {
  const out = []
  for (const deck of decks) {
    const list = lists.get(String(deck.deckId))
    if (list) out.push({ deck, list })
  }
  return out
}

/**
 * Inclusion stats for one section across entries.
 * @returns [{ name, k, n, rate, avgCopies, copies: {1: count, 2: count, ...} }]
 */
export function cardInclusion(entries, section = 'main') {
  const n = entries.length
  const map = new Map()
  for (const { list } of entries) {
    for (const [name, qty] of list[section]) {
      let e = map.get(name)
      if (!e) map.set(name, (e = { name, k: 0, copySum: 0, copies: {} }))
      e.k += 1
      e.copySum += qty
      e.copies[qty] = (e.copies[qty] || 0) + 1
    }
  }
  return [...map.values()]
    .map((e) => ({ name: e.name, k: e.k, n, rate: n ? e.k / n : 0, avgCopies: e.k ? e.copySum / e.k : 0, copies: e.copies }))
    .sort((a, b) => b.rate - a.rate || b.avgCopies - a.avgCopies || a.name.localeCompare(b.name))
}

export const LIFT_LABELS = {
  staple: 'Staple',
  tech: "Winner's tech",
  overplayed: 'Overplayed',
  flex: 'Flex',
}

/**
 * Card lift: inclusion in top-8 decks vs all other decks of the legend.
 * Labels need both groups >= minN and, for tech/overplayed, |lift| >= minLift
 * with a two-proportion z-test p < alpha. Otherwise the label is null.
 */
export function cardLift(entries, { section = 'main', minN = MIN_SAMPLE.cardDecks, minLift = 0.1, alpha = 0.05, stapleRate = 0.8 } = {}) {
  const top = entries.filter((e) => isTop8(e.deck))
  const rest = entries.filter((e) => !isTop8(e.deck))
  const topInc = new Map(cardInclusion(top, section).map((c) => [c.name, c]))
  const restInc = new Map(cardInclusion(rest, section).map((c) => [c.name, c]))
  const allInc = cardInclusion(entries, section)
  const enough = top.length >= minN && rest.length >= minN
  return allInc.map((c) => {
    const k1 = topInc.get(c.name)?.k || 0
    const k2 = restInc.get(c.name)?.k || 0
    const t = twoProportionTest(k1, top.length, k2, rest.length)
    let label = null
    if (enough) {
      const significant = t.p < alpha && Math.abs(t.diff) >= minLift
      if (significant && t.diff > 0) label = 'tech'
      else if (significant && t.diff < 0) label = 'overplayed'
      else if (c.rate >= stapleRate && t.p1 >= stapleRate - 0.1 && t.p2 >= stapleRate - 0.1) label = 'staple'
      else label = 'flex'
    }
    return {
      name: c.name,
      overall: { k: c.k, n: c.n, rate: c.rate },
      top8: { k: k1, n: top.length, rate: t.p1 },
      rest: { k: k2, n: rest.length, rate: t.p2 },
      lift: t.diff,
      p: t.p,
      avgCopies: c.avgCopies,
      label,
    }
  })
}

/**
 * Placement outcomes by number of copies for every card in a section.
 * @returns Map<name, [{ copies, n, top8, rate, low, high }]> (copies 0 = not played)
 */
export function copyCountStats(entries, { section = 'main', includeZero = true } = {}) {
  const out = new Map()
  const names = new Set()
  for (const { list } of entries) for (const name of list[section].keys()) names.add(name)
  for (const name of names) {
    const buckets = new Map()
    for (const { deck, list } of entries) {
      const q = list[section].get(name) || 0
      if (!q && !includeZero) continue
      let b = buckets.get(q)
      if (!b) buckets.set(q, (b = { copies: q, n: 0, top8: 0 }))
      b.n += 1
      if (isTop8(deck)) b.top8 += 1
    }
    out.set(
      name,
      [...buckets.values()]
        .sort((a, b) => a.copies - b.copies)
        .map((b) => {
          const w = wilsonInterval(b.top8, b.n)
          return { ...b, rate: w.p, low: w.low, high: w.high }
        })
    )
  }
  return out
}

// --- Variants (clustering) -------------------------------------------------

// Feature map for similarity: main-deck counts plus the rune split, so two
// lists with the same cards but a different rune ratio drift apart.
export function deckFeatures(list) {
  const f = new Map()
  for (const [name, q] of list.main) f.set(`m:${name}`, q)
  for (const [name, q] of list.runes) f.set(`r:${name}`, q)
  return f
}

export function distanceMatrix(features) {
  const n = features.length
  const d = Array.from({ length: n }, () => new Float64Array(n))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const v = 1 - weightedJaccard(features[i], features[j])
      d[i][j] = v
      d[j][i] = v
    }
  }
  return d
}

// k-medoids: k-medoids++ seeding, then alternate assign / medoid update.
export function kMedoids(dist, k, { seed = 7, maxIter = 30 } = {}) {
  const n = dist.length
  const rng = seededRng(seed)
  const medoids = [Math.floor(rng() * n)]
  while (medoids.length < k) {
    const w = new Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const m = Math.min(...medoids.map((c) => dist[i][c]))
      w[i] = m * m
      total += w[i]
    }
    if (!total) break
    let r = rng() * total
    let pick = 0
    for (; pick < n - 1; pick++) {
      r -= w[pick]
      if (r <= 0) break
    }
    if (!medoids.includes(pick)) medoids.push(pick)
  }
  let assign = new Array(n).fill(0)
  for (let iter = 0; iter < maxIter; iter++) {
    assign = assign.map((_, i) => {
      let best = 0
      for (let c = 1; c < medoids.length; c++) if (dist[i][medoids[c]] < dist[i][medoids[best]]) best = c
      return best
    })
    let changed = false
    for (let c = 0; c < medoids.length; c++) {
      const members = []
      for (let i = 0; i < n; i++) if (assign[i] === c) members.push(i)
      if (!members.length) continue
      let bestM = medoids[c]
      let bestCost = Infinity
      for (const cand of members) {
        let cost = 0
        for (const o of members) cost += dist[cand][o]
        if (cost < bestCost) {
          bestCost = cost
          bestM = cand
        }
      }
      if (bestM !== medoids[c]) {
        medoids[c] = bestM
        changed = true
      }
    }
    if (!changed) break
  }
  return { medoids, assign }
}

/** Mean silhouette of a clustering (higher = better separated, max 1). */
export function silhouette(dist, assign, k) {
  const n = dist.length
  if (k < 2 || n < 3) return 0
  let total = 0
  for (let i = 0; i < n; i++) {
    const sums = new Array(k).fill(0)
    const counts = new Array(k).fill(0)
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      sums[assign[j]] += dist[i][j]
      counts[assign[j]] += 1
    }
    const own = assign[i]
    if (!counts[own]) continue // singleton contributes 0
    const a = sums[own] / counts[own]
    let b = Infinity
    for (let c = 0; c < k; c++) if (c !== own && counts[c]) b = Math.min(b, sums[c] / counts[c])
    if (b === Infinity) continue
    total += (b - a) / Math.max(a, b)
  }
  return total / n
}

/**
 * Cluster a legend's lists into variants. k is chosen by silhouette among
 * 1..maxK, requiring every cluster to have >= minSize decks; k = 1 unless the
 * best split clears `minSilhouette`.
 */
export function clusterVariants(entries, { maxK = 6, minSize = MIN_SAMPLE.cluster, minSilhouette = 0.1, seed = 7 } = {}) {
  const n = entries.length
  if (!n) return { k: 0, silhouette: 0, variants: [] }
  const features = entries.map((e) => deckFeatures(e.list))
  const dist = distanceMatrix(features)
  let best = { k: 1, assign: new Array(n).fill(0), medoids: [medoidOf(dist, [...Array(n).keys()])], score: 0 }
  const kCap = Math.min(maxK, Math.floor(n / minSize))
  for (let k = 2; k <= kCap; k++) {
    const { medoids, assign } = kMedoids(dist, k, { seed })
    const sizes = new Array(medoids.length).fill(0)
    for (const a of assign) sizes[a] += 1
    if (sizes.some((s) => s < minSize)) continue
    const score = silhouette(dist, assign, medoids.length)
    if (score > best.score && score >= minSilhouette) best = { k: medoids.length, assign, medoids, score }
  }

  const groups = Array.from({ length: best.k }, () => [])
  best.assign.forEach((c, i) => groups[c].push(i))
  const variants = groups
    .map((idx, c) => describeVariant(entries, idx, best.medoids[c]))
    .sort((a, b) => b.size - a.size)
    .map((v, i) => ({ ...v, id: `v${i + 1}` }))
  return { k: best.k, silhouette: best.score, variants }
}

function medoidOf(dist, idx) {
  let best = idx[0]
  let bestCost = Infinity
  for (const i of idx) {
    let cost = 0
    for (const j of idx) cost += dist[i][j]
    if (cost < bestCost) {
      bestCost = cost
      best = i
    }
  }
  return best
}

function describeVariant(entries, idx, medoid) {
  const inSet = new Set(idx)
  const members = idx.map((i) => entries[i])
  const others = entries.filter((_, i) => !inSet.has(i))
  const inc = cardInclusion(members, 'main')
  const outInc = new Map(cardInclusion(others, 'main').map((c) => [c.name, c.rate]))
  // Distinctive = common inside the variant, rarer outside it.
  const signature = inc
    .map((c) => ({ name: c.name, rate: c.rate, outside: outInc.get(c.name) || 0, avgCopies: c.avgCopies }))
    .map((c) => ({ ...c, distinct: c.rate - c.outside }))
    .filter((c) => c.rate >= 0.5)
    .sort((a, b) => b.distinct - a.distinct || b.rate - a.rate)
  const top8 = members.filter((e) => isTop8(e.deck)).length
  const w = wilsonInterval(top8, members.length)
  const named = others.length ? signature.filter((c) => c.distinct > 0.15).slice(0, 2) : []
  return {
    size: members.length,
    deckIds: members.map((e) => String(e.deck.deckId)),
    medoidDeckId: String(entries[medoid]?.deck.deckId ?? ''),
    name: named.length ? named.map((c) => c.name).join(' + ') : 'Core list',
    signature: signature.slice(0, 6),
    top8: { k: top8, n: members.length, rate: w.p, low: w.low, high: w.high },
  }
}

// --- Consensus list --------------------------------------------------------

function modal(values, fallback) {
  if (!values.length) return fallback
  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
}

// Largest-remainder rounding of fractional counts to an exact total.
export function roundToTotal(items, total) {
  const floors = items.map((it) => ({ ...it, q: Math.floor(it.value), rem: it.value - Math.floor(it.value) }))
  let left = total - floors.reduce((s, it) => s + it.q, 0)
  const order = [...floors].sort((a, b) => b.rem - a.rem)
  for (let i = 0; left > 0 && order.length; i = (i + 1) % order.length, left--) order[i].q += 1
  return floors.filter((it) => it.q > 0)
}

/**
 * Build a legal list from the highest-weighted cards of a pool of entries.
 * Weight = inclusion in the pool's top-8 decks when there are >= minTop8 of
 * them, else across all decks. Optional budget swaps expensive cards for the
 * best cheaper card of the same role and similar energy cost.
 *
 * @param {Array} entries     pool (legend or variant)
 * @param {Map}   info        card info from parseDeckCards
 * @param {object} [opts]
 * @param {Array}  [opts.altEntries] wider pool to draw budget substitutes from
 * @param {number} [opts.budget]     max total price (0/undefined = no budget)
 * @param {Map}    [opts.liftByName] name -> lift, ranks substitutes
 */
export function consensusList(entries, info, { altEntries = entries, budget = 0, liftByName = new Map(), minTop8 = 5 } = {}) {
  const top = entries.filter((e) => isTop8(e.deck))
  const basis = top.length >= minTop8 ? top : entries
  const notes = []
  if (!basis.length) return { list: null, notes: ['No card lists available for this selection.'] }
  if (basis !== top) notes.push(`Fewer than ${minTop8} top-8 lists — weighted by all ${entries.length} lists.`)

  const legend = modal(basis.map((e) => e.list.legend).filter(Boolean), null)
  const champion = modal(basis.map((e) => e.list.champion).filter(Boolean), null)

  // Main deck: greedy by inclusion, modal copies, champion guaranteed.
  const mainInc = cardInclusion(basis, 'main')
  const main = new Map()
  let count = 0
  const copiesFor = (c) => Math.min(RULES.maxCopies, Math.max(1, Math.round(median(expandCopies(c.copies)))))
  if (champion) {
    const c = mainInc.find((x) => x.name === champion)
    const q = c ? copiesFor(c) : 1
    main.set(champion, q)
    count += q
  }
  for (const c of mainInc) {
    if (count >= RULES.mainSize) break
    if (main.has(c.name)) continue
    const q = Math.min(copiesFor(c), RULES.mainSize - count)
    main.set(c.name, q)
    count += q
  }
  // Top up (e.g. last card was clipped) by adding copies to high-inclusion cards.
  for (const c of mainInc) {
    if (count >= RULES.mainSize) break
    const cur = main.get(c.name) || 0
    const add = Math.min(RULES.maxCopies - cur, RULES.mainSize - count)
    if (add > 0) {
      main.set(c.name, cur + add)
      count += add
    }
  }
  if (count < RULES.mainSize) notes.push(`Only ${count} main-deck cards available in the pool.`)

  // Runes: average split rounded to exactly 12.
  const runeAvg = new Map()
  for (const { list } of basis) for (const [name, q] of list.runes) runeAvg.set(name, (runeAvg.get(name) || 0) + q / basis.length)
  const runes = new Map(
    roundToTotal([...runeAvg.entries()].map(([name, value]) => ({ name, value })), RULES.runeSize).map((r) => [r.name, r.q])
  )

  // Battlefields: three most included.
  const battlefields = new Map(cardInclusion(basis, 'battlefields').slice(0, RULES.battlefields).map((c) => [c.name, 1]))

  // Sideboard: modal size, most included cards that stay within copy limits.
  const sideSize = modal(basis.map((e) => sumValues(e.list.sideboard)).filter((s) => s > 0), RULES.defaultSideboard)
  const sideboard = new Map()
  let sideCount = 0
  for (const c of cardInclusion(basis, 'sideboard')) {
    if (sideCount >= sideSize) break
    const room = RULES.maxCopies - (main.get(c.name) || 0)
    const q = Math.min(copiesFor(c), room, sideSize - sideCount)
    if (q <= 0) continue
    sideboard.set(c.name, q)
    sideCount += q
  }

  const list = { legend, champion, main, runes, battlefields, sideboard }
  const swaps = budget > 0 ? applyBudget(list, info, altEntries, budget, liftByName, notes) : []
  return { list, swaps, notes, price: listPrice(list, info), basisSize: basis.length, basisTop8: basis === top }
}

function expandCopies(copies) {
  const out = []
  for (const [q, n] of Object.entries(copies)) for (let i = 0; i < n; i++) out.push(Number(q))
  return out
}

function sumValues(m) {
  let s = 0
  for (const v of m.values()) s += v
  return s
}

export function listPrice(list, info) {
  let total = 0
  let unknown = 0
  for (const section of ['main', 'sideboard', 'runes', 'battlefields']) {
    for (const [name, q] of list[section]) {
      const p = cardInfo(info, section, name).price
      if (p == null) unknown += 1
      else total += p * q
    }
  }
  return { total, unknown }
}

function applyBudget(list, info, altEntries, budget, liftByName, notes) {
  const swaps = []
  const pool = cardInclusion(altEntries, 'main')
  const tried = new Set()
  for (let guard = 0; guard < 60 && listPrice(list, info).total > budget; guard++) {
    // Most expensive replaceable line first (never the champion).
    const lines = [...list.main.entries()]
      .filter(([name]) => name !== list.champion && !tried.has(name))
      .map(([name, q]) => ({ name, q, info: cardInfo(info, 'main', name) }))
      .filter((l) => l.info.price != null)
      .sort((a, b) => b.info.price * b.q - a.info.price * a.q)
    const line = lines[0]
    if (!line) break
    tried.add(line.name)
    const sub = pool
      .filter((c) => !list.main.has(c.name) && !list.sideboard.has(c.name))
      .map((c) => ({ ...c, info: cardInfo(info, 'main', c.name) }))
      .filter((c) => c.info.price != null && c.info.price < line.info.price)
      .filter((c) => c.info.role === line.info.role)
      .filter((c) => line.info.energy == null || c.info.energy == null || Math.abs(c.info.energy - line.info.energy) <= 1)
      .sort((a, b) => (liftByName.get(b.name) ?? b.rate) - (liftByName.get(a.name) ?? a.rate) || a.info.price - b.info.price)[0]
    if (!sub) continue
    tried.add(sub.name) // never re-swap a card we just brought in
    list.main.delete(line.name)
    list.main.set(sub.name, line.q)
    swaps.push({ out: line.name, in: sub.name, copies: line.q, saved: (line.info.price - sub.info.price) * line.q })
  }
  const total = listPrice(list, info).total
  if (total > budget) notes.push(`Could not reach the $${budget} budget with same-role substitutes (now $${total.toFixed(2)}).`)
  return swaps
}

/** Plain-text export in the format the Consistency importer reads. */
export function deckToText(list) {
  const lines = []
  const section = (title, map) => {
    if (!map || !map.size) return
    lines.push(`${title}:`)
    for (const [name, q] of map) lines.push(`${q} ${name}`)
    lines.push('')
  }
  if (list.legend) section('Legend', new Map([[list.legend, 1]]))
  section('MainDeck', list.main)
  section('Battlefields', list.battlefields)
  section('Rune Pool', list.runes)
  section('Sideboard', list.sideboard)
  return lines.join('\n').trim() + '\n'
}

/** Turn a DeckList into a goldfish deck definition using card info. */
export function listToDeckDef(list, info, meta = {}) {
  const cards = [...list.main.entries()].map(([name, count]) => {
    const ci = cardInfo(info, 'main', name)
    return {
      name,
      count,
      cost: ci.energy,
      type: ci.role === 'spell' ? 'spell' : ci.role === 'gear' ? 'gear' : 'unit',
      tags: ci.domain || [],
    }
  })
  return { meta: { legendName: list.legend, mainDeckSize: sumValues(list.main), ...meta }, cards }
}

// --- Strategic choices: battlefields, sideboards, adoption ------------------

/**
 * For each card in a section: how many decks run it and how those decks
 * placed (top-8 rate with Wilson interval). Used for battlefields.
 */
export function sectionOutcomes(entries, section) {
  return cardInclusion(entries, section).map((c) => {
    const withCard = entries.filter((e) => e.list[section].has(c.name))
    const t8 = withCard.filter((e) => isTop8(e.deck)).length
    const w = wilsonInterval(t8, withCard.length)
    return { name: c.name, k: c.k, n: c.n, rate: c.rate, avgCopies: c.avgCopies, top8: { k: t8, n: withCard.length, rate: w.p, low: w.low, high: w.high } }
  })
}

/**
 * Weekly inclusion of each card in a section, overall and among top-8 decks.
 * @returns {{ weeks: string[], n: number[], n8: number[], cards: Map<name, {k:number[], k8:number[]}> }}
 */
export function weeklyInclusion(entries, section, weekOf) {
  const weeks = [...new Set(entries.filter((e) => e.deck.tournamentDate).map((e) => weekOf(e.deck.tournamentDate)))].sort()
  const wi = new Map(weeks.map((w, i) => [w, i]))
  const n = new Array(weeks.length).fill(0)
  const n8 = new Array(weeks.length).fill(0)
  const cards = new Map()
  for (const { deck, list } of entries) {
    if (!deck.tournamentDate) continue
    const i = wi.get(weekOf(deck.tournamentDate))
    const top = isTop8(deck)
    n[i] += 1
    if (top) n8[i] += 1
    for (const name of list[section].keys()) {
      if (!cards.has(name)) cards.set(name, { k: new Array(weeks.length).fill(0), k8: new Array(weeks.length).fill(0) })
      const c = cards.get(name)
      c.k[i] += 1
      if (top) c.k8[i] += 1
    }
  }
  return { weeks, n, n8, cards }
}

// Weighted least-squares slope of a weekly rate (weights = weekly n).
function weightedSlope(k, n) {
  let sw = 0
  let sx = 0
  let sy = 0
  for (let i = 0; i < n.length; i++) {
    if (!n[i]) continue
    sw += n[i]
    sx += n[i] * i
    sy += n[i] * (k[i] / n[i])
  }
  if (!sw) return 0
  const mx = sx / sw
  const my = sy / sw
  let num = 0
  let den = 0
  for (let i = 0; i < n.length; i++) {
    if (!n[i]) continue
    num += n[i] * (i - mx) * (k[i] / n[i] - my)
    den += n[i] * (i - mx) ** 2
  }
  return den ? num / den : 0
}

/**
 * Early movers: cards whose top-8 inclusion is rising faster than their
 * overall inclusion (slopes in inclusion-points per week). Needs >= minWeeks
 * weeks with data and >= minN top-8 lists overall.
 */
export function earlyMovers(weekly, { minWeeks = 3, minN = 10, minGap = 0.03 } = {}) {
  const weeksWithTop = weekly.n8.filter((v) => v > 0).length
  const total8 = weekly.n8.reduce((a, b) => a + b, 0)
  if (weeksWithTop < minWeeks || total8 < minN) return { enough: false, rows: [] }
  const rows = [...weekly.cards.entries()].map(([name, c]) => {
    const slopeAll = weightedSlope(c.k, weekly.n)
    const slopeTop = weightedSlope(c.k8, weekly.n8)
    return { name, slopeAll, slopeTop, gap: slopeTop - slopeAll, k: c.k.reduce((a, b) => a + b, 0), k8: c.k8.reduce((a, b) => a + b, 0) }
  })
  return {
    enough: true,
    rows: rows.filter((r) => r.gap >= minGap && r.slopeTop > 0).sort((a, b) => b.gap - a.gap),
  }
}

/**
 * Correlate a legend's sideboard choices with the field it faced: for each
 * (sideboard card, opposing legend) pair, the point-biserial correlation
 * across decks between "runs the card" and the opposing legend's share of
 * that deck's event field. Pairs need >= minN decks and some variation.
 *
 * @param {Array} entries      the legend's decks with card lists
 * @param {Map}   eventShares  tournamentKey -> Map<legendName, share of field>
 * @param {(deck)=>string} keyOf tournament key for a deck
 */
export function sideboardFieldCorrelation(entries, eventShares, keyOf, { opponents = [], minN = 20, minDecksWithCard = 3 } = {}) {
  if (entries.length < minN) return { enough: false, n: entries.length, rows: [] }
  const inc = cardInclusion(entries, 'sideboard').filter((c) => c.k >= minDecksWithCard && c.k <= entries.length - minDecksWithCard)
  const rows = []
  for (const opp of opponents) {
    const xs = entries.map((e) => eventShares.get(keyOf(e.deck))?.get(opp) || 0)
    if (Math.max(...xs) === Math.min(...xs)) continue
    for (const c of inc) {
      const ys = entries.map((e) => (e.list.sideboard.has(c.name) ? 1 : 0))
      const r = pearsonLocal(xs, ys)
      if (r == null) continue
      rows.push({ card: c.name, opponent: opp, r, n: entries.length, p: corrP(r, entries.length), k: c.k })
    }
  }
  return { enough: true, n: entries.length, rows: rows.sort((a, b) => b.r - a.r) }
}

function pearsonLocal(xs, ys) {
  const n = xs.length
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null
}

function corrP(r, n) {
  if (n < 4) return 1
  const z = Math.atanh(Math.max(-0.999999, Math.min(0.999999, r))) * Math.sqrt(n - 3)
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2)
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2)
  return 1 - erf
}

/**
 * New-set tracker: adoption of cards from `setCodes` by legend.
 * @returns [{ legend, decks, decksWithNew, cards: [{ name, k, n, rate, avgCopies }] }]
 */
export function newSetAdoption(entries, info, setCodes) {
  const sets = new Set(setCodes)
  const byLegend = new Map()
  for (const e of entries) {
    const name = e.deck.legendName || e.list.legend || 'Unknown'
    if (!byLegend.has(name)) byLegend.set(name, [])
    byLegend.get(name).push(e)
  }
  const out = []
  for (const [legend, list] of byLegend) {
    const isNew = (name) => sets.has(cardInfo(info, 'main', name).set)
    const cards = cardInclusion(list, 'main').filter((c) => isNew(c.name))
    const decksWithNew = list.filter((e) => [...e.list.main.keys()].some(isNew)).length
    out.push({ legend, decks: list.length, decksWithNew, cards })
  }
  return out.sort((a, b) => b.decksWithNew - a.decksWithNew || b.decks - a.decks)
}
