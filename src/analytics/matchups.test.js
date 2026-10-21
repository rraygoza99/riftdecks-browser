import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchup, normalizeField, fieldFromMatrix, fieldFromDecks, expectedVsField, probabilityTable, simulateSwiss, rankCandidates } from './matchups.js'
import { analyzeMetaTargeting } from './metaTargeting.js'

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

const matrix = {
  A: { B: { winrate: 70, matches: 1000 }, C: { winrate: 100, matches: 2 } },
  B: { A: { winrate: 30, matches: 1000 } },
}

test('matchup shrinks low-n cells toward 50%', () => {
  const ab = matchup(matrix, 'A', 'B', { priorStrength: 20 })
  close(ab.p, (700 + 10) / 1020)
  assert.equal(ab.n, 1000)
  const ac = matchup(matrix, 'A', 'C', { priorStrength: 20 })
  close(ac.p, (2 + 10) / 22) // 2-0 record barely moves it
  // Reverse-cell fallback.
  const ca = matchup(matrix, 'C', 'A', { priorStrength: 20 })
  close(ca.p, 10 / 22)
  // No data at all -> exactly 50%.
  close(matchup(matrix, 'B', 'C').p, 0.5)
  assert.equal(matchup(matrix, 'A', 'A').mirror, true)
  close(matchup(matrix, 'A', 'A').p, 0.5)
})

test('normalizeField / fieldFromMatrix / fieldFromDecks', () => {
  const f = normalizeField({ A: 3, B: 1, C: 0 })
  close(f.get('A'), 0.75)
  assert.equal(f.has('C'), false)
  const g = fieldFromMatrix({ legends: [{ name: 'A', matches: 30 }, { name: 'B', matches: 10 }] })
  close(g.get('B'), 0.25)
  const h = fieldFromDecks([{ legendName: 'A' }, { legendName: 'A' }, { legendName: 'Z' }], ['A', 'B'])
  close(h.field.get('A'), 1)
  close(h.unmatchedShare, 1 / 3)
})

test('expectedVsField weights by share and includes the mirror', () => {
  const field = new Map([['A', 0.5], ['B', 0.5]])
  const [first, second] = expectedVsField(matrix, ['A', 'B'], field, { priorStrength: 20 })
  assert.equal(first.legend, 'A')
  const pAB = (700 + 10) / 1020
  close(first.ewr, 0.5 * 0.5 + 0.5 * pAB)
  close(second.ewr, 0.5 * 0.5 + 0.5 * (1 - pAB))
  assert.ok(first.low < first.ewr && first.high > first.ewr)
  close(first.coveredShare, 1)
  // Unknown opponent -> wider band than a well-sampled one.
  const wide = expectedVsField(matrix, ['B'], new Map([['C', 1]]))[0]
  assert.ok(wide.sd > first.sd)
  close(wide.coveredShare, 0)
})

test('simulateSwiss: dominant legend makes top cut and wins far more often', () => {
  const m = { Strong: { Weak: { winrate: 90, matches: 100000 } }, Weak: { Strong: { winrate: 10, matches: 100000 } } }
  const field = new Map([['Weak', 1]])
  const table = probabilityTable(m, ['Strong', 'Weak'])
  const strong = simulateSwiss({ field, chosen: 'Strong', players: 32, rounds: 5, topCut: 8, sims: 400, table, seed: 3 })
  const weak = simulateSwiss({ field, chosen: 'Weak', players: 32, rounds: 5, topCut: 8, sims: 400, table, seed: 3 })
  assert.ok(strong.chosen.topCut / 400 > 0.8)
  assert.ok(strong.chosen.wins / 400 > 0.4)
  // A Weak player in an all-Weak field: about 8/32 cut and 1/32 wins.
  const t = weak.chosen.topCut / 400
  assert.ok(t > 0.15 && t < 0.35, `topCut ${t}`)
  // Field stats exclude the tracked player.
  const w = weak.byLegend.get('Weak')
  assert.equal(w.entries, 31 * 400)
  assert.equal(w.topCut + weak.chosen.topCut, 8 * 400)
  assert.equal(w.wins + weak.chosen.wins, 400)
})

test('simulateSwiss handles odd players and no top cut', () => {
  const table = probabilityTable({}, ['A', 'B'])
  const res = simulateSwiss({ field: new Map([['A', 0.5], ['B', 0.5]]), chosen: 'A', players: 7, rounds: 3, topCut: 0, sims: 200, table })
  const totalWins = [...res.byLegend.values()].reduce((s, x) => s + x.wins, 0) + res.chosen.wins
  assert.equal(totalWins, 200)
})

test('anti-meta: underplayed is relative to the presence distribution', () => {
  // 10 legends with presence 1..10 (%-ish); top meta = 3.
  const legends = Array.from({ length: 10 }, (_, i) => ({ name: `L${i}`, matches: (i + 1) * 100 }))
  const mx = {}
  for (const a of legends) {
    mx[a.name] = {}
    for (const b of legends) if (a !== b) mx[a.name][b.name] = { winrate: a.name === 'L5' ? 60 : a.name === 'L1' ? 58 : 50, matches: 200 }
  }
  const res = analyzeMetaTargeting({ legends, matrix: mx }, { topMeta: 3, underplayedPercentile: 0.5, antiMetaMinPresence: 0 })
  const picks = res.recommendations.antiMeta.map((r) => r.legend)
  // L5 has the best record but is above-median presence -> not "underplayed".
  assert.ok(!picks.includes('L5'))
  assert.ok(picks.includes('L1'))
  assert.ok(res.underplayed.maxPresencePct > 0)
})

test('rankCandidates ranks the best answer to a chosen field', () => {
  const m = {
    Counter: { Popular: { winrate: 65, matches: 2000 }, Other: { winrate: 50, matches: 2000 } },
    Popular: { Other: { winrate: 55, matches: 2000 } },
  }
  const field = new Map([['Popular', 3], ['Other', 1]])
  const rows = rankCandidates(m, ['Counter', 'Popular', 'Other'], field, { event: { players: 16, rounds: 4, topCut: 4, sims: 300 } })
  assert.equal(rows[0].legend, 'Counter')
  close(rows[0].matchups.reduce((s, x) => s + x.share, 0), 1)
  assert.equal(rows[0].matchups[0].opponent, 'Popular')
  assert.equal(rows[0].best.opponent, 'Popular')
  assert.equal(rows[0].worst.opponent, 'Other')
  // Popular faces its own mirror 75% of the time: mirror excluded from worst/best.
  const pop = rows.find((r) => r.legend === 'Popular')
  assert.equal(pop.worst.opponent, 'Other')
  assert.ok(rows[0].sim.topCut / 300 > pop.sim.topCut / 300)
  assert.equal(rankCandidates(m, ['Counter'], new Map())[0].matchups.length, 0)
})
