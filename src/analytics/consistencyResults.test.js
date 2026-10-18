import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correlateConsistency, metricsFromReport } from './consistencyResults.js'
import { seededRng } from '../stats/stats.js'

test('metricsFromReport', () => {
  const m = metricsFromReport({ metrics: { brickRate: 2, curveEfficiency: 80, thresholds: { units_by_t3: { probability: 40 } } } })
  assert.deepEqual(m, { brickRate: 2, curveEfficiency: 80, unitsByT3: 40 })
  assert.equal(metricsFromReport({ metrics: { brickRate: 1, curveEfficiency: 1, thresholds: {} } }).unitsByT3, null)
})

test('correlateConsistency detects a real relationship', () => {
  const rows = []
  for (let i = 0; i < 60; i++) {
    const standing = i < 30 ? 1 + (i % 8) : 20 + i
    // Top-8 decks brick less.
    rows.push({ deck: { standing, totalPlayers: 100 }, metrics: { brickRate: standing <= 8 ? 1 + (i % 3) : 6 + (i % 3), curveEfficiency: 80, unitsByT3: 50 + (i % 5) } })
  }
  const res = correlateConsistency(rows)
  const brick = res.results.find((r) => r.key === 'brickRate')
  assert.ok(brick.top8.r < -0.8)
  assert.ok(brick.top8.p < 0.001)
  assert.ok(brick.meaningful)
  assert.ok(brick.top8.meanTop < brick.top8.meanRest)
  // Constant metric -> no correlation possible.
  const eff = res.results.find((r) => r.key === 'curveEfficiency')
  assert.equal(eff.top8.r, null)
  assert.equal(eff.meaningful, false)
})

test('correlateConsistency reports noise as not meaningful', () => {
  const rng = seededRng(5)
  const rows = Array.from({ length: 40 }, (_, i) => ({
    deck: { standing: i % 2 ? 1 : 30, totalPlayers: 64 },
    metrics: { brickRate: rng() * 5, curveEfficiency: 70 + rng() * 10, unitsByT3: rng() * 100 },
  }))
  const res = correlateConsistency(rows)
  assert.equal(res.n, 40)
  for (const r of res.results) assert.ok(Math.abs(r.top8.r) < 0.45)
})

test('correlateConsistency with only top-8 decks reports empty groups', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ deck: { standing: 1 + (i % 8), totalPlayers: 64 }, metrics: { brickRate: i, curveEfficiency: 80, unitsByT3: 40 } }))
  const res = correlateConsistency(rows)
  assert.equal(res.nTop, 10)
  assert.equal(res.nRest, 0)
  assert.equal(res.results[0].top8.meanRest, null)
  assert.equal(res.results[0].top8.r, null)
})
