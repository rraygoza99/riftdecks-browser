import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveLegend, compareToGlobal } from './personal.js'

const known = ['Kennen, Heart of the Tempest', 'Rengar, Pridestalker', 'Master Yi, Wuju Bladesman', 'Master Yi, Wuju Master']
const matrix = {
  'Kennen, Heart of the Tempest': { 'Rengar, Pridestalker': { winrate: 46, matches: 516 } },
}

test('resolveLegend', () => {
  assert.equal(resolveLegend('Rengar, Pridestalker', known), 'Rengar, Pridestalker')
  assert.equal(resolveLegend('rengar', known), 'Rengar, Pridestalker')
  assert.equal(resolveLegend('Master Yi', known), null) // ambiguous
  assert.equal(resolveLegend('', known), null)
  assert.equal(resolveLegend('Nobody', known), null)
})

test('compareToGlobal flags a big personal gap', () => {
  const matches = [
    ...Array.from({ length: 1 }, () => ({ opponent: 'Rengar', result: 'win' })),
    ...Array.from({ length: 9 }, () => ({ opponent: 'Rengar', result: 'loss' })),
    { opponent: 'Rengar', result: 'draw' },
    { opponent: 'Mystery', result: 'win' },
  ]
  const res = compareToGlobal('Kennen', matches, matrix, known, { priorStrength: 0 })
  assert.equal(res.legend, 'Kennen, Heart of the Tempest')
  const r = res.rows[0]
  assert.equal(r.opponent, 'Rengar')
  assert.equal(r.decisive, 10)
  assert.equal(r.draw, 1)
  assert.ok(Math.abs(r.global - 0.46) < 1e-9)
  assert.ok(Math.abs(r.gap - (0.1 - 0.46)) < 1e-9)
  assert.equal(r.flagged, true)
  const m = res.rows.find((x) => x.opponent === 'Mystery')
  assert.equal(m.global, null)
  assert.equal(m.flagged, false)
})

test('compareToGlobal: small or on-par records are not flagged', () => {
  const matches = [
    { opponent: 'Rengar', result: 'win' },
    { opponent: 'Rengar', result: 'loss' },
    { opponent: 'Rengar', result: 'loss' },
  ]
  const res = compareToGlobal('Kennen, Heart of the Tempest', matches, matrix, known)
  assert.equal(res.rows[0].flagged, false)
})
