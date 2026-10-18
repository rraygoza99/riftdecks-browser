import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sectionOutcomes, weeklyInclusion, earlyMovers, sideboardFieldCorrelation, newSetAdoption } from './cardAnalysis.js'

const list = (o = {}) => ({
  legend: 'L', champion: null, main: new Map(o.main || []), runes: new Map(), battlefields: new Map(o.bf || []), sideboard: new Map(o.side || []),
})
const weekOf = (d) => d

test('sectionOutcomes gives top-8 rate per battlefield', () => {
  const entries = [
    { deck: { standing: 1 }, list: list({ bf: [['A', 1], ['B', 1]] }) },
    { deck: { standing: 2 }, list: list({ bf: [['A', 1]] }) },
    { deck: { standing: 20 }, list: list({ bf: [['B', 1]] }) },
  ]
  const out = new Map(sectionOutcomes(entries, 'battlefields').map((r) => [r.name, r]))
  assert.equal(out.get('A').k, 2)
  assert.equal(out.get('A').top8.k, 2)
  assert.equal(out.get('B').top8.k, 1)
  assert.equal(out.get('B').top8.n, 2)
})

test('weeklyInclusion + earlyMovers flags cards rising faster in top-8', () => {
  const entries = []
  for (let w = 0; w < 4; w++) {
    for (let i = 0; i < 10; i++) {
      const top = i < 5
      // "Mover": top-8 decks adopt it week over week; rest never do.
      const mover = top && i < w + 1
      entries.push({ deck: { standing: top ? 1 : 20, tournamentDate: `w${w}` }, list: list({ main: [['Core', 3], ...(mover ? [['Mover', 2]] : [])] }) })
    }
  }
  const weekly = weeklyInclusion(entries, 'main', weekOf)
  assert.deepEqual(weekly.weeks, ['w0', 'w1', 'w2', 'w3'])
  assert.deepEqual(weekly.cards.get('Mover').k8, [1, 2, 3, 4])
  const em = earlyMovers(weekly, { minN: 10 })
  assert.equal(em.enough, true)
  assert.equal(em.rows[0].name, 'Mover')
  assert.ok(!em.rows.some((r) => r.name === 'Core'))
  assert.equal(earlyMovers(weeklyInclusion(entries.slice(0, 10), 'main', weekOf)).enough, false)
})

test('sideboardFieldCorrelation finds a card that tracks an opponent', () => {
  const entries = []
  const shares = new Map()
  for (let i = 0; i < 30; i++) {
    const share = i / 30
    shares.set(`t${i}`, new Map([['Opp', share], ['Other', 0.1 + (i % 3) * 0.05]]))
    entries.push({ deck: { tk: `t${i}` }, list: list({ side: [['Hate', share > 0.5 ? 2 : 0], ['Filler', 2]].filter(([, q]) => q) }) })
  }
  const res = sideboardFieldCorrelation(entries, shares, (d) => d.tk, { opponents: ['Opp', 'Other'], minN: 20 })
  assert.equal(res.enough, true)
  const top = res.rows[0]
  assert.equal(top.card, 'Hate')
  assert.equal(top.opponent, 'Opp')
  assert.ok(top.r > 0.8 && top.p < 0.001)
  // Filler is in every deck -> no variation -> excluded.
  assert.ok(!res.rows.some((r) => r.card === 'Filler'))
  assert.equal(sideboardFieldCorrelation(entries.slice(0, 5), shares, (d) => d.tk, { opponents: ['Opp'] }).enough, false)
})

test('newSetAdoption counts new-set cards by legend', () => {
  const info = new Map([
    ['main:New', { set: 'RAD' }],
    ['main:Old', { set: 'VEN' }],
  ])
  const entries = [
    { deck: { legendName: 'A' }, list: list({ main: [['New', 2], ['Old', 3]] }) },
    { deck: { legendName: 'A' }, list: list({ main: [['Old', 3]] }) },
    { deck: { legendName: 'B' }, list: list({ main: [['Old', 3]] }) },
  ]
  const out = newSetAdoption(entries, info, ['RAD'])
  assert.equal(out[0].legend, 'A')
  assert.equal(out[0].decksWithNew, 1)
  assert.equal(out[0].cards[0].name, 'New')
  assert.equal(out[0].cards[0].rate, 0.5)
  assert.equal(out[1].decksWithNew, 0)
})
