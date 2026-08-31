import { readFileSync } from 'fs'
const lc = JSON.parse(readFileSync('public/legend-cards.json', 'utf8'))
console.log('legends:', lc.legends.length)
const L = lc.legends[0]
console.log('legend keys:', Object.keys(L))
console.log('sample legend meta:', JSON.stringify({ legendName: L.legendName, decksSampled: L.decksSampled, totalDecks: L.totalDecks, cardCount: (L.cards || []).length }))
console.log('card sample:', JSON.stringify(L.cards[0]))
const dc = JSON.parse(readFileSync('data/deck-cards.json', 'utf8'))
const k = Object.keys(dc)[0]
const entry = dc[k]
console.log('\ndeck-cards entry keys:', Object.keys(entry))
const cards = entry.cards || []
console.log('deck-cards sample card:', JSON.stringify(cards[0]))
const ca = JSON.parse(readFileSync('data/card-attributes.json', 'utf8'))
const ck = Object.keys(ca)[0]
console.log('\ncard-attributes sample:', ck, JSON.stringify(ca[ck]).slice(0, 400))
