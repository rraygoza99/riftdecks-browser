import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseDeckCards, entriesFor, cardInclusion, cardLift, copyCountStats, clusterVariants, kMedoids,
  silhouette, distanceMatrix, deckFeatures, consensusList, deckToText, roundToTotal, listPrice,
  listToDeckDef, RULES,
} from './cardAnalysis.js'
import { parseDeckList } from '../simulation/deckImport.js'

// Build a compact export from readable deck specs.
function makeRaw(specs) {
  const cards = []
  const idx = new Map()
  const ref = (name, type, extra = {}) => {
    const key = `${name}|${type}`
    if (!idx.has(key)) {
      idx.set(key, cards.length)
      cards.push({ name, type, price: 1, energy: 2, cardType: type === 'spell' ? 'Spell' : 'Unit', ...extra })
    }
    return idx.get(key)
  }
  const decks = {}
  for (const s of specs) {
    const rows = [[ref(s.legend || 'Hero, Legend', 'legend'), 1]]
    if (s.champion) rows.push([ref(s.champion, 'champion'), 1])
    for (const [name, q, extra] of s.main) rows.push([ref(name, extra?.type || 'unit', extra), q])
    for (const [name, q] of s.runes || []) rows.push([ref(name, 'runes'), q])
    for (const name of s.bf || []) rows.push([ref(name, 'battlefields'), 1])
    for (const [name, q] of s.side || []) rows.push([ref(name, 'sideboard'), q])
    decks[s.id] = rows
  }
  return { generatedAt: 'x', cards, decks }
}

// 13 x 3 copies = 39 + champion = 40.
const filler = (prefix, n = 13, q = 3) => Array.from({ length: n }, (_, i) => [`${prefix}${i}`, q])

test('parseDeckCards merges champion + unit rows and splits sections', () => {
  const raw = makeRaw([
    { id: '1', champion: 'Champ', main: [['Champ', 2], ['A', 3]], runes: [['Fury Rune', 7], ['Calm Rune', 5]], bf: ['BF1'], side: [['S1', 2]] },
  ])
  const { lists, info } = parseDeckCards(raw)
  const l = lists.get('1')
  assert.equal(l.legend, 'Hero, Legend')
  assert.equal(l.champion, 'Champ')
  assert.equal(l.main.get('Champ'), 3)
  assert.equal(l.runes.get('Fury Rune'), 7)
  assert.equal(l.battlefields.size, 1)
  assert.equal(l.sideboard.get('S1'), 2)
  assert.equal(info.get('main:Champ').type, 'unit') // non-champion row preferred
  assert.deepEqual(parseDeckCards(null).lists.size, 0)
})

function scenario() {
  // 10 top-8 decks all play Tech; 10 others never do. Everyone plays Core.
  const specs = []
  for (let i = 0; i < 20; i++) {
    const top = i < 10
    specs.push({
      id: String(i),
      champion: 'Champ',
      main: [['Core', 3], ...(top ? [['Tech', 2]] : [['Trap', 2]]), ...filler('F', 11, 3), ['Champ', 2]],
      runes: [['Fury Rune', top ? 8 : 6], ['Calm Rune', top ? 4 : 6]],
      bf: ['BF1', 'BF2', i % 2 ? 'BF3' : 'BF4'],
      side: [['S1', 3], ['S2', 3], ['S3', 2]],
    })
  }
  const raw = makeRaw(specs)
  const { lists, info } = parseDeckCards(raw)
  const decks = specs.map((s, i) => ({ deckId: s.id, standing: i < 10 ? (i % 8) + 1 : 16, legendName: 'Hero, Legend' }))
  return { entries: entriesFor(decks, lists), info, lists, decks }
}

test('entriesFor drops decks without lists', () => {
  const { lists } = scenario()
  assert.equal(entriesFor([{ deckId: '1' }, { deckId: 'missing' }], lists).length, 1)
})

test('cardInclusion counts decks and copies', () => {
  const { entries } = scenario()
  const inc = cardInclusion(entries)
  const core = inc.find((c) => c.name === 'Core')
  assert.equal(core.k, 20)
  assert.equal(core.rate, 1)
  assert.equal(core.avgCopies, 3)
  const tech = inc.find((c) => c.name === 'Tech')
  assert.equal(tech.k, 10)
  assert.deepEqual(tech.copies, { 2: 10 })
})

test('cardLift labels staples, tech and overplayed; small samples are unlabelled', () => {
  const { entries } = scenario()
  const lift = new Map(cardLift(entries).map((c) => [c.name, c]))
  assert.equal(lift.get('Core').label, 'staple')
  assert.equal(lift.get('Tech').label, 'tech')
  assert.equal(lift.get('Tech').top8.k, 10)
  assert.equal(lift.get('Tech').rest.k, 0)
  assert.ok(Math.abs(lift.get('Tech').lift - 1) < 1e-9)
  assert.equal(lift.get('Trap').label, 'overplayed')
  const few = cardLift(entries.slice(0, 12)) // only 2 non-top-8 decks
  assert.ok(few.every((c) => c.label === null))
})

test('copyCountStats buckets by copies with Wilson intervals', () => {
  const { entries } = scenario()
  const stats = copyCountStats(entries)
  const tech = stats.get('Tech')
  assert.deepEqual(tech.map((b) => [b.copies, b.n, b.top8]), [[0, 10, 0], [2, 10, 10]])
  assert.ok(tech[1].low > 0.6)
})

test('distance / kMedoids / silhouette separate two obvious groups', () => {
  const a = { main: new Map([['x', 3], ['y', 3]]), runes: new Map() }
  const b = { main: new Map([['p', 3], ['q', 3]]), runes: new Map() }
  const feats = [a, a, a, b, b, b].map(deckFeatures)
  const d = distanceMatrix(feats)
  assert.equal(d[0][1], 0)
  assert.equal(d[0][3], 1)
  const { assign } = kMedoids(d, 2, { seed: 3 })
  assert.equal(new Set(assign.slice(0, 3)).size, 1)
  assert.notEqual(assign[0], assign[3])
  assert.ok(silhouette(d, assign, 2) > 0.9)
  assert.equal(silhouette(d, assign, 1), 0)
})

test('clusterVariants finds the two builds and names them', () => {
  const { entries } = scenario()
  const res = clusterVariants(entries, { minSize: 4 })
  assert.equal(res.k, 2)
  assert.equal(res.variants.length, 2)
  const names = res.variants.map((v) => v.name).join(' | ')
  assert.match(names, /Tech/)
  assert.match(names, /Trap/)
  const techV = res.variants.find((v) => v.name.includes('Tech'))
  assert.equal(techV.top8.k, 10)
  assert.equal(techV.size, 10)
  // Too few decks -> one variant.
  assert.equal(clusterVariants(entries.slice(0, 5)).k, 1)
  assert.equal(clusterVariants([]).k, 0)
})

test('roundToTotal', () => {
  const r = roundToTotal([{ name: 'a', value: 7.4 }, { name: 'b', value: 4.6 }], 12)
  assert.deepEqual(r.map((x) => [x.name, x.q]), [['a', 7], ['b', 5]])
  const s = roundToTotal([{ name: 'a', value: 5.5 }, { name: 'b', value: 5.5 }, { name: 'c', value: 1 }], 12)
  assert.equal(s.reduce((t, x) => t + x.q, 0), 12)
})

test('consensusList builds a legal list from top-8 decks', () => {
  const { entries, info } = scenario()
  const res = consensusList(entries, info)
  const { list } = res
  const sum = (m) => [...m.values()].reduce((a, b) => a + b, 0)
  assert.equal(sum(list.main), RULES.mainSize)
  assert.equal(sum(list.runes), RULES.runeSize)
  assert.equal(list.runes.get('Fury Rune'), 8)
  assert.equal(list.battlefields.size, 3)
  assert.equal(sum(list.sideboard), 8)
  assert.ok([...list.main.values()].every((q) => q <= RULES.maxCopies))
  assert.ok(list.main.has('Tech'))
  assert.ok(!list.main.has('Trap'))
  assert.equal(list.champion, 'Champ')
  assert.equal(res.basisTop8, true)
})

test('consensusList budget mode swaps expensive cards for same-role cheaper ones', () => {
  const specs = []
  for (let i = 0; i < 10; i++) {
    specs.push({
      id: String(i),
      champion: 'Champ',
      main: [
        ['Pricey', 3, { price: 50, energy: 3 }],
        ...(i < 3 ? [['Budget', 3, { price: 1, energy: 3 }]] : []),
        ['Spell', 3, { type: 'spell', price: 0.5, energy: 3, cardType: 'Spell' }],
        ...filler('F', 11, 3),
      ],
      runes: [['Fury Rune', 12]],
      bf: ['B1', 'B2', 'B3'],
    })
  }
  const { lists, info } = parseDeckCards(makeRaw(specs))
  const entries = entriesFor(specs.map((s) => ({ deckId: s.id, standing: 1 })), lists)
  const full = consensusList(entries, info)
  assert.ok(full.list.main.has('Pricey'))
  assert.ok(!full.list.main.has('Budget')) // only 30% inclusion, cut by greedy fill
  const cheap = consensusList(entries, info, { budget: 100 })
  assert.ok(!cheap.list.main.has('Pricey'))
  assert.equal(cheap.list.main.get('Budget'), 3)
  assert.equal(cheap.swaps[0].out, 'Pricey')
  assert.ok(listPrice(cheap.list, info).total <= 100)
})

test('consensusList with no data', () => {
  assert.equal(consensusList([], new Map()).list, null)
})

test('deckToText round-trips through the Consistency importer', () => {
  const { entries, info } = scenario()
  const { list } = consensusList(entries, info)
  const text = deckToText(list)
  assert.match(text, /^Legend:\n1 Hero, Legend\n/)
  const parsed = parseDeckList(text)
  assert.equal(parsed.legendName, 'Hero, Legend')
  assert.equal(parsed.mainDeck.reduce((s, c) => s + c.count, 0), 40)
  assert.equal(parsed.runePool.reduce((s, c) => s + c.count, 0), 12)
  assert.equal(parsed.sideboard.reduce((s, c) => s + c.count, 0), 8)
  assert.equal(parsed.battlefields.length, 3)
  const def = listToDeckDef(list, info)
  assert.equal(def.cards.reduce((s, c) => s + c.count, 0), 40)
  assert.equal(def.cards[0].cost, 2)
})
