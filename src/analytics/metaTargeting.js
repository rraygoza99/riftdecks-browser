// Meta-targeting analytics: turn a head-to-head winrate matrix + presence into a
// vulnerability matrix and anti-meta recommendations.
//
// Input is the parsed riftdecks winrate matrix:
//   { metagame, matchesAnalyzed, legends: [{ name, overallWinrate, matches }],
//     matrix: { [rowLegend]: { [colLegend]: { winrate, matches } } } }
//
// winrate cells are row-vs-column win percentages (0..100). Presence is derived
// from each legend's total match count (its share of "seats" in the field).

const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d

// Winrate of `a` vs `b` as 0..1, with a reverse-cell fallback and a sample gate.
function matchupWinrate(matrix, a, b, minMatches) {
  const cell = matrix[a]?.[b]
  if (cell && cell.matches >= minMatches) return cell.winrate / 100
  const rev = matrix[b]?.[a]
  if (rev && rev.matches >= minMatches) return 1 - rev.winrate / 100
  return null
}

// Presence-weighted average winrate of `a` across a set of opponents.
function weightedWinrate(matrix, a, opponents, presence, minMatches) {
  let num = 0
  let den = 0
  for (const o of opponents) {
    if (o === a) continue
    const w = matchupWinrate(matrix, a, o, minMatches)
    if (w == null) continue
    num += w * presence[o]
    den += presence[o]
  }
  return den > 0 ? num / den : null
}

function median(values) {
  if (!values.length) return 0
  const s = [...values].sort((x, y) => x - y)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function tierFor(presencePct, expWr, presenceMedianPct, hasData) {
  if (!hasData) return 'Unproven'
  const popular = presencePct >= presenceMedianPct
  if (popular && expWr >= 0.54) return 'Oppressor'
  if (popular && expWr < 0.47) return 'Overexposed'
  if (popular) return 'Pillar'
  if (expWr >= 0.53) return 'Sleeper'
  if (expWr < 0.47) return 'Underdog'
  return 'Niche'
}

/**
 * @param {object} winrateData - parsed matrix (see file header).
 * @param {object} [options]
 * @param {number} [options.minMatches=30] - ignore matchup cells below this sample size.
 * @param {number} [options.topMeta=8] - how many top-presence legends define "the meta".
 * @param {number} [options.worstN=4] - counters listed per vulnerable legend.
 */
export function analyzeMetaTargeting(winrateData, options = {}) {
  const { minMatches = 30, topMeta = 8, worstN = 4, antiMetaMinPresence = 1.0 } = options
  const { legends = [], matrix = {}, metagame = '', matchesAnalyzed = 0 } = winrateData

  const names = legends.map((l) => l.name)
  const totalSeats = legends.reduce((s, l) => s + l.matches, 0) || 1
  const presence = {}
  const presencePct = {}
  for (const l of legends) {
    presence[l.name] = l.matches / totalSeats
    presencePct[l.name] = round((l.matches / totalSeats) * 100, 2)
  }

  // "The meta" = the most-played legends, by presence.
  const metaList = [...legends].sort((a, b) => b.matches - a.matches).slice(0, topMeta).map((l) => l.name)
  const presenceMedianPct = median(Object.values(presencePct))

  // Core per-legend metrics. Winrates are null when no cell clears minMatches,
  // so rare legends don't masquerade as 50% coinflips against the field.
  const field = names.map((name) => {
    const expRaw = weightedWinrate(matrix, name, names, presence, minMatches)
    const metaRaw = weightedWinrate(matrix, name, metaList, presence, minMatches)
    const hasData = metaRaw != null
    const pPct = presencePct[name]
    // Presence-weighted beatability: popular AND losing => high systemic risk.
    const vulnerabilityIndex = round(pPct * (1 - (expRaw ?? 0.5)), 2)
    return {
      legend: name,
      presencePct: pPct,
      expectedWinratePct: expRaw != null ? round(expRaw * 100) : null,
      vsMetaWinratePct: metaRaw != null ? round(metaRaw * 100) : null,
      vulnerabilityIndex,
      hasData,
      tier: tierFor(pPct, expRaw ?? 0.5, presenceMedianPct, hasData),
    }
  })

  const byLegend = Object.fromEntries(field.map((f) => [f.legend, f]))

  // Worst matchups (counters) for a target legend.
  const countersOf = (target) =>
    names
      .filter((o) => o !== target)
      .map((o) => ({
        opponent: o,
        winrateAgainstPct: round((matchupWinrate(matrix, o, target, minMatches) ?? 0) * 100),
        matches: matrix[o]?.[target]?.matches ?? matrix[target]?.[o]?.matches ?? 0,
        opponentPresencePct: presencePct[o],
      }))
      .filter((m) => m.matches >= minMatches && m.winrateAgainstPct > 50)
      .sort((a, b) => b.winrateAgainstPct - a.winrateAgainstPct)

  // Meta Vulnerability Matrix: the popular legends and how to punish them.
  const vulnerabilityMatrix = [...field]
    .filter((f) => f.presencePct >= presenceMedianPct)
    .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)
    .map((f) => {
      const worst = countersOf(f.legend).slice(0, worstN)
      return {
        legend: f.legend,
        presencePct: f.presencePct,
        expectedWinratePct: f.expectedWinratePct,
        vulnerabilityIndex: f.vulnerabilityIndex,
        tier: f.tier,
        worstMatchups: worst,
        recommendedAnswer: worst[0]?.opponent ?? null,
      }
    })

  // Anti-meta recommendations: legends outside the top-presence meta that have
  // real data and the best record against the popular field.
  const metaSet = new Set(metaList)
  const antiMeta = [...field]
    .filter((f) => !metaSet.has(f.legend) && f.hasData && f.presencePct >= antiMetaMinPresence)
    .sort((a, b) => b.vsMetaWinratePct - a.vsMetaWinratePct)
    .slice(0, 8)
    .map((f) => {
      const punishes = metaList
        .filter((m) => m !== f.legend)
        .map((m) => ({
          legend: m,
          winratePct: round((matchupWinrate(matrix, f.legend, m, minMatches) ?? 0) * 100),
          presencePct: presencePct[m],
        }))
        .filter((p) => p.winratePct > 50)
        .sort((a, b) => b.winratePct - a.winratePct)
        .slice(0, 3)
      return {
        legend: f.legend,
        presencePct: f.presencePct,
        vsMetaWinratePct: f.vsMetaWinratePct,
        expectedWinratePct: f.expectedWinratePct,
        tier: f.tier,
        punishes,
      }
    })
    .filter((r) => r.punishes.length > 0)

  // Over-indexed strategies: the most-played, most-beatable legends.
  const overIndexed = [...vulnerabilityMatrix]
    .sort((a, b) => b.presencePct - a.presencePct)
    .slice(0, topMeta)
    .map((v) => ({
      legend: v.legend,
      presencePct: v.presencePct,
      expectedWinratePct: v.expectedWinratePct,
      recommendedAnswer: v.recommendedAnswer,
      answerWinratePct: v.worstMatchups[0]?.winrateAgainstPct ?? null,
    }))

  return {
    metagame,
    matchesAnalyzed,
    minMatches,
    metaLegends: metaList,
    field: [...field].sort((a, b) => b.presencePct - a.presencePct),
    vulnerabilityMatrix,
    recommendations: {
      overIndexed,
      antiMeta,
      notes:
        'Winrate-grounded. Anti-meta picks are underplayed legends with the best record vs the ' +
        'top-presence field; recommendedAnswer is the strongest sampled counter. Card-level tech ' +
        '(removal profiles, negation) requires decklist metadata and can layer on top of these targets.',
    },
    table: formatMatrix(vulnerabilityMatrix, antiMeta),
    json: JSON.stringify(
      { metagame, matchesAnalyzed, metaLegends: metaList, vulnerabilityMatrix, recommendations: { overIndexed, antiMeta } },
      null,
      2,
    ),
  }
}

const short = (name) => (name || '').split(',')[0]

export function formatMatrix(vulnerabilityMatrix, antiMeta) {
  const lines = []
  lines.push('META VULNERABILITY MATRIX (popular legends, most exploitable first)')
  lines.push(
    ['Legend'.padEnd(16), 'Pres%'.padStart(6), 'ExpWR'.padStart(6), 'Vuln'.padStart(6), 'Top counters'].join('  '),
  )
  lines.push('-'.repeat(72))
  for (const v of vulnerabilityMatrix) {
    const counters = v.worstMatchups
      .map((m) => `${short(m.opponent)} ${m.winrateAgainstPct}%`)
      .join(', ')
    lines.push(
      [
        short(v.legend).padEnd(16),
        `${v.presencePct}`.padStart(6),
        `${v.expectedWinratePct}%`.padStart(6),
        `${v.vulnerabilityIndex}`.padStart(6),
        counters,
      ].join('  '),
    )
  }
  lines.push('')
  lines.push('ANTI-META PICKS (underplayed, best vs the top field)')
  lines.push(['Legend'.padEnd(16), 'Pres%'.padStart(6), 'vsMeta'.padStart(7), 'Punishes'].join('  '))
  lines.push('-'.repeat(72))
  for (const r of antiMeta) {
    const punishes = r.punishes.map((p) => `${short(p.legend)} ${p.winratePct}%`).join(', ')
    lines.push(
      [short(r.legend).padEnd(16), `${r.presencePct}`.padStart(6), `${r.vsMetaWinratePct}%`.padStart(7), punishes].join(
        '  ',
      ),
    )
  }
  return lines.join('\n')
}
