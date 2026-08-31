/**
 * Meta-targeting report: loads the winrate matrix, runs the vulnerability
 * analysis, prints the Meta Vulnerability Matrix + anti-meta picks, and saves
 * a JSON report.
 *
 * Usage:
 *   node scripts/meta-target.mjs                         # uses data/winrate-matrix.json
 *   node scripts/meta-target.mjs --in data/winrate-matrix.json --out data/meta-vulnerability.json
 *   node scripts/meta-target.mjs --min-matches 50 --top-meta 10
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { analyzeMetaTargeting } from '../src/analytics/metaTargeting.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const args = process.argv.slice(2)
  const getArg = (f, def) => {
    const i = args.indexOf(f)
    return i !== -1 ? args[i + 1] : def
  }
  const inPath = path.resolve(getArg('--in', path.join(__dirname, '../data/winrate-matrix.json')))
  const outPath = path.resolve(getArg('--out', path.join(__dirname, '../data/meta-vulnerability.json')))
  const minMatches = parseInt(getArg('--min-matches', '30'), 10)
  const topMeta = parseInt(getArg('--top-meta', '8'), 10)

  const winrateData = JSON.parse(await fs.readFile(inPath, 'utf8'))
  const report = analyzeMetaTargeting(winrateData, { minMatches, topMeta })

  await fs.writeFile(outPath, report.json)
  console.error(`Wrote ${outPath}`)

  console.log(`\n${report.metagame} — ${report.matchesAnalyzed.toLocaleString()} matches analyzed`)
  console.log(`Meta defined by: ${report.metaLegends.map((n) => n.split(',')[0]).join(', ')}`)
  console.log('')
  console.log(report.table)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
