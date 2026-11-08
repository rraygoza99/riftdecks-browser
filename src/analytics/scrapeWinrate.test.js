import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWinrateMatrix, assertHasMatrix } from '../../scripts/scrape-winrate.mjs'

const MATRIX_HTML = `
<option value="5" selected="selected">Radiance Metagame</option>
<div>1,234 Matches Analyzed</div>
<table><thead><tr><th><span title="Kai&#039;sa, Daughter of the Void" class="avatar"></span></th></tr></thead>
<tbody><tr class="item" data-name="Kennen, Heart of the Tempest" data-winrate="0.55" data-matches="100">
<td class="winrate-cell" data-winrate="55"></td>
<td class="winrate-cell" data-winrate="60"><span class="matches-number">40 matches</span></td>
</tr></tbody></table>`

test('parseWinrateMatrix reads a matrix page and it passes the guard', () => {
  const data = parseWinrateMatrix(MATRIX_HTML)
  assert.equal(data.metagame, 'Radiance Metagame')
  assert.equal(data.matchesAnalyzed, 1234)
  assert.deepEqual(data.matrix['Kennen, Heart of the Tempest']["Kai'sa, Daughter of the Void"], { winrate: 60, matches: 40 })
  assert.doesNotThrow(() => assertHasMatrix(data))
})

test('assertHasMatrix rejects a login page', () => {
  const data = parseWinrateMatrix('<html><form action="/login"><input type="password"></form></html>')
  assert.throws(() => assertHasMatrix(data), /No winrate matrix found/)
})

test('assertHasMatrix rejects legends with no matchup cells', () => {
  assert.throws(
    () => assertHasMatrix({ legends: [{ name: 'A' }], matrix: { A: {} } }),
    /No winrate matrix found/,
  )
})
