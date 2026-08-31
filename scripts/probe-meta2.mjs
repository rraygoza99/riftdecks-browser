import { readFileSync } from 'fs'
const td = JSON.parse(readFileSync('data/tournament-decks.json', 'utf8'))
const tids = Object.keys(td)
console.log('tournaments:', tids.length)
const t0 = td[tids[0]]
console.log('tournament keys:', Object.keys(t0))
const d0 = (t0.decks || [])[0]
console.log('deck fields:', Object.keys(d0))
console.log('deck sample:', JSON.stringify(d0))

function idFromUrl(u) {
  const m = (u || '').match(/(\d+)$/)
  return m ? m[1] : ''
}
const dc = JSON.parse(readFileSync('data/deck-cards.json', 'utf8'))
const dcIds = new Set(Object.keys(dc))
let total = 0
let withCards = 0
const byStanding = {}
const metaSets = new Set()
for (const tid of tids) {
  for (const d of td[tid].decks || []) {
    total++
    if (d.metaSet) metaSets.add(d.metaSet)
    const id = idFromUrl(d.deckUrl)
    if (dcIds.has(id)) withCards++
    byStanding[d.standing] = (byStanding[d.standing] || 0) + 1
  }
}
console.log('total decks:', total, 'with card lists:', withCards)
console.log('metaSets:', [...metaSets])
console.log('standing dist:', Object.fromEntries(Object.entries(byStanding).sort((a, b) => a[0] - b[0]).slice(0, 8)))
