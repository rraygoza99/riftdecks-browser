import { test } from 'node:test'
import assert from 'node:assert/strict'
import { legendCounts, rankByRate, weightedPerformance, topCutRatio, regionSplit, weekStart, weeklyShares, momentum } from './metaStats.js'

const deck = (o) => ({ tournamentId: 't', totalPlayers: 10, standing: 10, legendName: 'A', tournamentCountry: 'US', tournamentDate: '2026-10-07', ...o })

test('legendCounts and rankByRate: small lucky samples do not top the ranking', () => {
  const decks = []
  // Ivern-like: 2 firsts in 26.
  for (let i = 0; i < 26; i++) decks.push(deck({ legendName: 'Ivern', standing: i < 2 ? 1 : 20 }))
  // Big legend: 40 firsts in 500 (8%, similar raw rate, far more data).
  for (let i = 0; i < 500; i++) decks.push(deck({ legendName: 'Kennen', standing: i < 40 ? 1 : 20 }))
  // Tiny: 1 of 1.
  decks.push(deck({ legendName: 'Tiny', standing: 1 }))
  const rows = legendCounts(decks)
  assert.equal(rows[0].name, 'Kennen')
  assert.equal(rows.find((r) => r.name === 'Ivern').firsts, 2)
  const ranked = rankByRate(rows, 'firsts', { minN: 10 })
  assert.equal(ranked[0].name, 'Kennen')
  assert.equal(ranked.at(-1).name, 'Tiny')
  assert.equal(ranked.at(-1).eligible, false)
  // Raw rate would have put Tiny (100%) first.
  assert.ok(ranked.find((r) => r.name === 'Tiny').rate === 1)
})

test('weightedPerformance weights by log2(players)', () => {
  const decks = [
    deck({ totalPlayers: 512, standing: 1 }), // w = 9, top-8
    deck({ totalPlayers: 8, standing: 20 }), // w = 3, not top-8
  ]
  const [r] = weightedPerformance(decks)
  assert.equal(r.rawRate, 0.5)
  assert.ok(Math.abs(r.weightedRate - 9 / 12) < 1e-9)
  assert.ok(r.nEff > 1 && r.nEff < 2)
})

test('topCutRatio uses only fully covered events', () => {
  const decks = []
  // Full event: 16 players, 16 decks. A = 8 decks with 6 in top 8.
  for (let i = 1; i <= 16; i++) decks.push(deck({ tournamentId: 'full', totalPlayers: 16, standing: i, legendName: (i <= 6 || i > 14) ? 'A' : 'B' }))
  // Low-coverage event ignored.
  decks.push(deck({ tournamentId: 'low', totalPlayers: 200, standing: 1, legendName: 'B' }))
  const res = topCutRatio(decks)
  assert.equal(res.events, 1)
  assert.equal(res.decks, 16)
  const a = res.rows.find((r) => r.name === 'A')
  assert.equal(a.fieldDecks, 8)
  assert.equal(a.cutDecks, 6)
  assert.ok(Math.abs(a.ratio - (6 / 8) / (8 / 16)) < 1e-9)
})

test('regionSplit', () => {
  const res = regionSplit([deck({ tournamentCountry: 'CN' }), deck({ tournamentCountry: 'DE' }), deck({ tournamentCountry: null })])
  assert.equal(res.CN.decks, 1)
  assert.equal(res.EU.decks, 1)
  assert.equal(res.Unknown.decks, 1)
  assert.equal(res.NA.decks, 0)
})

test('weekStart / weeklyShares / momentum', () => {
  assert.equal(weekStart('2026-10-11'), '2026-10-05') // Sunday -> Monday before
  assert.equal(weekStart('2026-10-05'), '2026-10-05')
  const decks = []
  const weeks = ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']
  weeks.forEach((w, i) => {
    for (let j = 0; j < 100; j++) decks.push(deck({ tournamentDate: w, legendName: j < 5 + i * 10 ? 'Riser' : 'Other' }))
  })
  const weekly = weeklyShares(decks)
  assert.deepEqual(weekly.weeks, weeks)
  assert.deepEqual(weekly.series.get('Riser').k, [5, 15, 25, 35])
  const m = momentum(weekly, 'Riser')
  assert.equal(m.label, 'rising')
  assert.ok(m.slope > 0.09)
  assert.equal(momentum(weekly, 'Other').label, 'falling')
  assert.equal(momentum(weekly, 'Nobody').label, 'steady')
})
