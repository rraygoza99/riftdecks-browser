import { test } from 'node:test'
import assert from 'node:assert/strict'
import { regionOf } from './regions.js'
import { normalizeLegendName, normalizeDeckLegend } from './legendNames.js'
import { applyScope, describeScope, countEvents } from './scope.js'
import { eventCoverage, filterByCoverage, isLowCoverage, formatCoverage } from '../stats/coverage.js'

const mk = (o) => ({
  tournamentId: 't1', tournamentName: 'T', totalPlayers: 4, standing: 1, legendName: 'A',
  metaSet: 'Vendetta', tournamentDate: '2026-10-10', tournamentCountry: 'US', price: 100, ...o,
})

test('regionOf', () => {
  assert.equal(regionOf('CN'), 'CN')
  assert.equal(regionOf('us'), 'NA')
  assert.equal(regionOf('DE'), 'EU')
  assert.equal(regionOf('GB'), 'EU')
  assert.equal(regionOf('SG'), 'Other')
  assert.equal(regionOf(null), 'Unknown')
  assert.equal(regionOf('???'), 'Unknown')
})

test('legend aliases', () => {
  assert.equal(normalizeLegendName('Viktor, Innovator'), 'Viktor, Herald of the Arcane')
  assert.equal(normalizeLegendName('Master Yi, Wuju Master'), 'Master Yi, Wuju Master')
  const d = { legendName: 'Kennen, Heart of the Tempest' }
  assert.equal(normalizeDeckLegend(d), d)
  assert.equal(normalizeDeckLegend({ legendName: 'Viktor, Innovator' }).legendAliasOf, 'Viktor, Innovator')
})

test('eventCoverage: decks / players, capped and full flags', () => {
  const decks = [
    ...Array.from({ length: 2 }, (_, i) => mk({ tournamentId: 'low', totalPlayers: 118, standing: i + 1 })),
    ...Array.from({ length: 4 }, (_, i) => mk({ tournamentId: 'full', totalPlayers: 4, standing: i + 1 })),
    ...Array.from({ length: 64 }, (_, i) => mk({ tournamentId: 'cap', totalPlayers: 300, standing: i + 1 })),
    mk({ tournamentId: 'unk', totalPlayers: null }),
  ]
  const cov = eventCoverage(decks)
  assert.equal(cov.get('low').coverage, 2 / 118)
  assert.equal(cov.get('full').coverage, 1)
  assert.equal(cov.get('full').full, true)
  assert.equal(cov.get('cap').capped, true)
  assert.equal(cov.get('cap').full, false)
  assert.equal(cov.get('unk').coverage, null)
  assert.equal(isLowCoverage(cov.get('low'), 0.5), true)
  assert.equal(isLowCoverage(cov.get('unk'), 0.5), false)
  assert.equal(formatCoverage(cov.get('cap')), '21%')
  assert.equal(formatCoverage(cov.get('unk')), '—')
  assert.equal(filterByCoverage(decks, 0.5, cov).length, 4 + 1)
  assert.equal(filterByCoverage(decks, 0, cov).length, decks.length)
})

test('applyScope filters; coverage is judged on the unfiltered event', () => {
  const now = Date.parse('2026-10-18T00:00:00Z')
  const decks = [
    mk({ legendName: 'A', standing: 1 }),
    mk({ legendName: 'B', standing: 2 }),
    mk({ legendName: 'A', standing: 3, metaSet: 'Radiance' }),
    mk({ legendName: 'A', standing: 1, tournamentId: 't2', tournamentDate: '2026-08-01', tournamentCountry: 'CN' }),
  ]
  assert.equal(applyScope(decks, { meta: 'Vendetta' }, { now }).length, 3)
  assert.equal(applyScope(decks, { dateRange: '30d' }, { now }).length, 3)
  assert.equal(applyScope(decks, { region: 'CN' }, { now }).length, 1)
  assert.equal(applyScope(decks, { legends: ['B'] }, { now }).length, 1)
  assert.equal(applyScope(decks, { legends: ['B'] }, { now, skip: ['legends'] }).length, 4)
  assert.equal(applyScope(decks, { maxPlacement: 2 }, { now }).length, 3)
  // t1 has 3 decks / 4 players = 75%; filtering to legend B must not drop it.
  assert.equal(applyScope(decks, { legends: ['B'], minCoverage: 0.5 }, { now }).length, 1)
  // t2 has 1 deck / 4 players = 25%.
  assert.equal(applyScope(decks, { minCoverage: 0.5 }, { now }).length, 3)
  assert.equal(applyScope(decks, { minCoverage: 0.8 }, { now }).length, 0)
  assert.equal(countEvents(decks), 2)
})

test('describeScope', () => {
  const s = describeScope({ meta: 'Vendetta', dateRange: '30d', region: 'EU', minCoverage: 0.5 })
  assert.equal(s, 'Vendetta meta · last 30 days · region EU · events ≥ 50% coverage')
  assert.equal(describeScope({ meta: 'all', dateRange: 'all' }, { skip: ['minCoverage'] }), 'all metas · all dates')
})
