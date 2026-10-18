import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  wilsonInterval, wilsonLower, shrinkRate, estimateBetaPrior, twoProportionTest, normalCdf,
  binomialTestP, rankScore, formatRateN, formatInterval, ordinal, quantile, median, linearFit,
  pearson, spearman, correlationPValue, eventWeight, weightedJaccard, seededRng, formatPct,
} from './stats.js'

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`)

test('wilsonInterval matches reference values', () => {
  // 2/26 -> [0.0213, 0.2413] (standard Wilson 95%).
  const w = wilsonInterval(2, 26)
  close(w.p, 2 / 26)
  close(w.low, 0.0213, 1e-3)
  close(w.high, 0.2413, 1e-3)
  const h = wilsonInterval(50, 100)
  close(h.low + h.high, 1)
  close(h.low, 0.4038, 1e-3)
})

test('wilsonInterval edge cases', () => {
  assert.deepEqual(wilsonInterval(0, 0), { p: 0, low: 0, high: 1, n: 0, k: 0 })
  const zero = wilsonInterval(0, 10)
  assert.equal(zero.low, 0)
  assert.ok(zero.high > 0.2 && zero.high < 0.35)
  const all = wilsonInterval(10, 10)
  close(all.high, 1)
  assert.ok(all.low > 0.65)
})

test('wilsonLower ranks big samples above small lucky ones', () => {
  assert.ok(wilsonLower(60, 581) > wilsonLower(2, 26))
  assert.ok(wilsonLower(40, 100) > wilsonLower(1, 1))
})

test('shrinkRate pulls small samples to the prior', () => {
  close(shrinkRate(2, 2, 0.1, 20), 4 / 22)
  close(shrinkRate(0, 0, 0.3, 10), 0.3)
  close(shrinkRate(500, 1000, 0.1, 20), (500 + 2) / 1020)
  close(shrinkRate(5, 10, 0.5, 0), 0.5)
})

test('estimateBetaPrior recovers mean; homogeneous groups give a strong prior', () => {
  const same = Array.from({ length: 20 }, () => ({ k: 10, n: 100 }))
  const p = estimateBetaPrior(same)
  close(p.mean, 0.1)
  assert.equal(p.strength, 500)
  const spread = [{ k: 1, n: 100 }, { k: 30, n: 100 }, { k: 5, n: 100 }, { k: 50, n: 100 }]
  const q = estimateBetaPrior(spread)
  assert.ok(q.strength < 50 && q.strength >= 2)
  assert.deepEqual(estimateBetaPrior([]), { mean: 0, strength: 2 })
})

test('normalCdf', () => {
  close(normalCdf(0), 0.5, 1e-6)
  close(normalCdf(1.959964), 0.975, 1e-4)
  close(normalCdf(-1.959964), 0.025, 1e-4)
})

test('twoProportionTest', () => {
  const t = twoProportionTest(30, 100, 10, 100)
  close(t.diff, 0.2)
  assert.ok(t.p < 0.001)
  assert.ok(twoProportionTest(10, 100, 11, 100).p > 0.5)
  assert.equal(twoProportionTest(1, 0, 1, 5).p, 1)
  assert.equal(twoProportionTest(0, 5, 0, 5).p, 1)
})

test('binomialTestP', () => {
  close(binomialTestP(5, 10, 0.5), 1, 1e-9)
  close(binomialTestP(0, 10, 0.5), 2 / 1024, 1e-9)
  assert.ok(binomialTestP(3, 10, 0.46) > 0.3)
  assert.equal(binomialTestP(0, 0, 0.5), 1)
})

test('rankScore wilson vs shrink', () => {
  close(rankScore(2, 26), wilsonLower(2, 26))
  close(rankScore(2, 26, { method: 'shrink', prior: { mean: 0.05, strength: 50 } }), (2 + 2.5) / 76)
})

test('formatting helpers', () => {
  assert.equal(formatRateN(2, 26), '7.7% · 2/26')
  assert.equal(formatRateN(0, 0), '— · 0/0')
  assert.equal(formatInterval(2, 26), '2.1–24.1%')
  assert.equal(formatPct(null), '—')
})

test('ordinal handles teens and every suffix', () => {
  const cases = {
    0: '0th', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th',
    21: '21st', 22: '22nd', 23: '23rd', 32: '32nd', 64: '64th', 101: '101st', 111: '111th',
    112: '112th',
  }
  for (const [n, s] of Object.entries(cases)) assert.equal(ordinal(Number(n)), s)
  assert.equal(ordinal(null), '—')
})

test('quantile / median', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([1, 2, 3, 4]), 2.5)
  assert.equal(quantile([0, 10], 0.25), 2.5)
  assert.equal(median([]), 0)
})

test('linearFit', () => {
  const f = linearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])
  close(f.slope, 2)
  close(f.intercept, 1)
  assert.equal(linearFit([]).slope, 0)
})

test('pearson / spearman / correlationPValue', () => {
  close(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1)
  close(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1)
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null)
  close(spearman([1, 2, 3, 4], [1, 4, 9, 16]), 1)
  assert.ok(correlationPValue(0.9, 50) < 0.001)
  assert.ok(correlationPValue(0.05, 20) > 0.5)
  assert.equal(correlationPValue(null, 20), 1)
})

test('eventWeight grows logarithmically', () => {
  close(eventWeight(32), 5)
  close(eventWeight(1), 1)
  assert.ok(eventWeight(512) / eventWeight(32) < 2)
})

test('weightedJaccard', () => {
  const a = new Map([['x', 3], ['y', 1]])
  const b = new Map([['x', 2], ['z', 2]])
  close(weightedJaccard(a, b), 2 / 6)
  close(weightedJaccard(a, a), 1)
  close(weightedJaccard(new Map(), new Map()), 1)
})

test('seededRng is deterministic', () => {
  const r1 = seededRng(42)
  const r2 = seededRng(42)
  for (let i = 0; i < 5; i++) assert.equal(r1(), r2())
})
