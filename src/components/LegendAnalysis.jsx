import { useMemo, useState } from 'react'
import AnalyticsBar from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import { applyScope, describeScope, countEvents } from '../data/scope'
import { legendSlug, tournamentKey } from '../tournamentUtils'
import {
  entriesFor, isTop8, cardInclusion, cardLift, copyCountStats, clusterVariants, consensusList,
  deckToText, cardInfo, listToDeckDef, sectionOutcomes, weeklyInclusion, sideboardFieldCorrelation, LIFT_LABELS, listPrice,
} from '../analytics/cardAnalysis'
import { weekStart } from '../analytics/metaStats'
import { formatRateN, formatInterval, formatPct, MIN_SAMPLE } from '../stats/stats'
import './LegendAnalysis.css'
import './Analytics.css'

const BASE = 'https://riftdecks.com'
const TYPE_ORDER = ['champion', 'unit', 'gear', 'spell', 'other']
const TYPE_LABELS = { champion: 'Champion', unit: 'Units', gear: 'Gear', spell: 'Spells', other: 'Other' }
const LABEL_CLASS = { staple: 'an-badge--accent', tech: 'an-badge--good', overplayed: 'an-badge--bad', flex: '' }
const TABS = [
  ['cards', 'Cards'],
  ['variants', 'Variants'],
  ['consensus', 'Consensus list'],
  ['battlefields', 'Battlefields'],
  ['sideboard', 'Sideboard'],
]
const SCRAPE_HINT = 'npm run scrape -- --cards-all --cards-per-legend 0 --max-card-decks 6000'
const short = (name) => (name || '').split(',')[0]
const fmtMoney = (v) => (v == null ? '—' : `${v.toFixed(2)}`)

// Simulator deck from cached card costs. Up to 10% unknown costs are filled
// with 3; beyond that return null so the Consistency page resolves the text
// list through riftcodex instead.
function completeDeckDef(list, info) {
  const def = listToDeckDef(list, info, { title: `${(list.legend || '').split(',')[0]} (consensus)`, costSource: 'riftcodex (cached)' })
  const total = def.cards.reduce((t, c) => t + c.count, 0)
  const unknown = def.cards.filter((c) => c.cost == null).reduce((t, c) => t + c.count, 0)
  if (!total || unknown / total > 0.1) return null
  def.cards = def.cards.map((c) => (c.cost == null ? { ...c, cost: 3 } : c))
  if (unknown) def.meta.costSource = `riftcodex (cached; ${unknown} card(s) without a cost set to 3)`
  return def
}

export default function LegendAnalysis({
  allDecks, scope, onScopeChange, legendOptions, metaOptions, coverage, deckCards, slug, onBackToList, onShowVariant, onSimulate,
}) {
  const [group, setGroup] = useState('all')
  const [tab, setTab] = useState('cards')
  const info = deckCards?.data?.info
  const lists = deckCards?.data?.lists

  const legendName = useMemo(() => allDecks.find((d) => legendSlug(d.legendName) === slug)?.legendName ?? null, [allDecks, slug])

  const scoped = useMemo(
    () => applyScope(allDecks, scope, { skip: ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice'], coverage }),
    [allDecks, scope, coverage]
  )
  const legendDecks = useMemo(() => scoped.filter((d) => d.legendName === legendName), [scoped, legendName])
  const entries = useMemo(() => (lists ? entriesFor(legendDecks, lists) : []), [legendDecks, lists])
  const groupEntries = useMemo(() => (group === 'top8' ? entries.filter((e) => isTop8(e.deck)) : entries), [entries, group])
  const top8Count = entries.filter((e) => isTop8(e.deck)).length

  const lift = useMemo(() => new Map(cardLift(entries).map((c) => [c.name, c])), [entries])
  const copies = useMemo(() => copyCountStats(entries), [entries])

  const placement = useMemo(() => {
    const n = legendDecks.length
    const firsts = legendDecks.filter((d) => d.standing === 1).length
    const top8 = legendDecks.filter((d) => d.standing <= 8).length
    return { n, firsts, top8 }
  }, [legendDecks])

  if (!legendName) {
    return (
      <div className="legend-analysis">
        <button type="button" className="legal-back" onClick={onBackToList}>
          ← All legends
        </button>
        <div className="app-status">No decks found for this legend.</div>
      </div>
    )
  }

  const tile = legendDecks.find((d) => d.legendTileUrl)?.legendTileUrl || allDecks.find((d) => d.legendName === legendName)?.legendTileUrl

  return (
    <section className="legend-analysis">
      <button type="button" className="legal-back" onClick={onBackToList}>
        ← All legends
      </button>

      <header className="legend-analysis-head">
        {tile && <span className="legend-analysis-tile" style={{ backgroundImage: `url(${tile})` }} aria-hidden="true" />}
        <div>
          <h2 className="legend-analysis-name">{legendName}</h2>
          <p className="legend-analysis-meta">
            {placement.n} decks in scope · 1st {formatRateN(placement.firsts, placement.n)} · top-8{' '}
            {formatRateN(placement.top8, placement.n)} · <strong>{entries.length}</strong> with card lists ({top8Count} top-8)
          </p>
        </div>
      </header>

      <AnalyticsBar
        scope={scope}
        onScopeChange={onScopeChange}
        legendOptions={legendOptions}
        metaOptions={metaOptions}
        show={['dateRange', 'meta', 'region', 'minCoverage']}
      >
        <div className="filter-group">
          <span className="filter-label">Card stats from</span>
          <div className="filter-seg">
            {[
              ['top8', `Top-8 decks (${top8Count})`],
              ['all', `All decks (${entries.length})`],
            ].map(([k, l]) => (
              <button key={k} type="button" className={`seg-btn ${group === k ? 'seg-btn--active' : ''}`} onClick={() => setGroup(k)}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </AnalyticsBar>

      <DataSourceNote
        dataset="cards"
        filters={describeScope(scope, { skip: ['maxPrice', 'maxPlacePct', 'maxPlacement', 'legends'] })}
        counts={`${entries.length} of ${legendDecks.length} ${short(legendName)} decks have card lists · ${countEvents(entries.map((e) => e.deck))} events`}
        extra={
          entries.length < legendDecks.length
            ? `Card lists are missing for ${legendDecks.length - entries.length} decks; rates below use only decks with lists. A local "${SCRAPE_HINT}" run fills them in.`
            : null
        }
      />

      <div className="an-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" className={`an-tab${tab === k ? ' an-tab--active' : ''}`} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {deckCards?.loading ? (
        <div className="app-status">Loading card lists…</div>
      ) : !entries.length ? (
        <div className="an-card an-empty">
          No card lists for {short(legendName)} in the current scope. Widen the date/meta filters or run{' '}
          <code>{SCRAPE_HINT}</code> locally to collect them.
        </div>
      ) : tab === 'cards' ? (
        <CardsPanel entries={groupEntries} allEntries={entries} info={info} lift={lift} copies={copies} group={group} />
      ) : tab === 'variants' ? (
        <VariantsPanel entries={entries} legendName={legendName} onShowVariant={onShowVariant} />
      ) : tab === 'consensus' ? (
        <ConsensusPanel entries={entries} info={info} lift={lift} onSimulate={onSimulate} />
      ) : tab === 'battlefields' ? (
        <BattlefieldsPanel entries={entries} />
      ) : (
        <SideboardPanel entries={entries} scoped={scoped} legendName={legendName} />
      )}
    </section>
  )
}

function CardsPanel({ entries, allEntries, info, lift, copies, group }) {
  const sections = useMemo(() => {
    const byType = new Map()
    for (const c of cardInclusion(entries, 'main')) {
      const t = cardInfo(info, 'main', c.name).type
      const type = TYPE_ORDER.includes(t) ? t : 'other'
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type).push(c)
    }
    const out = TYPE_ORDER.filter((t) => byType.has(t)).map((t) => ({ type: t, label: TYPE_LABELS[t], cards: byType.get(t) }))
    const runes = cardInclusion(entries, 'runes')
    if (runes.length) out.push({ type: 'runes', label: 'Runes', cards: runes })
    return out
  }, [entries, info])

  const top = allEntries.filter((e) => isTop8(e.deck)).length
  const rest = allEntries.length - top
  const liftReady = top >= MIN_SAMPLE.cardDecks && rest >= MIN_SAMPLE.cardDecks

  return (
    <>
      <p className="legend-analysis-guide">
        <strong>Inclusion</strong> = share of {group === 'top8' ? 'top-8' : 'all'} decks with card lists ({entries.length}) that run the
        card. <strong>Lift</strong> compares inclusion in top-8 decks ({top}) with all other decks ({rest}):{' '}
        <em>Staple</em> = ≥ 80% everywhere, <em>Winner&apos;s tech</em> / <em>Overplayed</em> = at least 10 points
        higher / lower in top-8 decks with p &lt; 0.05. Labels need ≥ {MIN_SAMPLE.cardDecks} decks in each group
        {liftReady ? '.' : ' — not met yet, so no labels are shown.'} Expand a card for placement outcomes by copy count.
      </p>
      {sections.map((section) => (
        <div key={section.type} className="legend-section">
          <h3 className="legend-section-title">
            {section.label} <span className="legend-section-count">{section.cards.length}</span>
          </h3>
          <ul className="card-rows">
            {section.cards.map((card) => {
              const sec = section.type === 'runes' ? 'runes' : 'main'
              const ci = cardInfo(info, sec, card.name)
              const l = sec === 'main' ? lift.get(card.name) : null
              const cc = sec === 'main' ? copies.get(card.name) : null
              return (
                <li key={card.name} className="card-row card-row--detail">
                  {ci.img ? (
                    <img className="card-row-img" src={ci.img} alt="" loading="lazy" />
                  ) : (
                    <span className="card-row-img card-row-img--empty" aria-hidden="true" />
                  )}
                  <div className="card-row-main">
                    <div className="card-row-top">
                      {ci.cardUrl ? (
                        <a className="card-row-name" href={`${BASE}${ci.cardUrl}`} target="_blank" rel="noopener noreferrer">
                          {card.name}
                        </a>
                      ) : (
                        <span className="card-row-name">{card.name}</span>
                      )}
                      {l?.label && (
                        <span
                          className={`an-badge ${LABEL_CLASS[l.label]}`}
                          title={`Top-8 ${formatRateN(l.top8.k, l.top8.n)} vs rest ${formatRateN(l.rest.k, l.rest.n)} · p = ${l.p.toFixed(3)}`}
                        >
                          {LIFT_LABELS[l.label]}
                        </span>
                      )}
                      <span className="card-row-copies">{card.avgCopies.toFixed(1)}× avg</span>
                    </div>
                    <div className="card-row-bar">
                      <span className="card-row-bar-fill" style={{ width: `${Math.max(3, card.rate * 100)}%` }} />
                    </div>
                    {l && l.top8.n > 0 && l.rest.n > 0 && (
                      <div className="an-small">
                        Top-8 {formatRateN(l.top8.k, l.top8.n, 0)} · rest {formatRateN(l.rest.k, l.rest.n, 0)} · lift{' '}
                        <span className={l.lift > 0 ? 'an-up' : l.lift < 0 ? 'an-down' : ''}>
                          {l.lift >= 0 ? '+' : ''}
                          {(l.lift * 100).toFixed(0)} pts
                        </span>
                      </div>
                    )}
                    {cc && cc.length > 1 && (
                      <details className="an-small">
                        <summary>Placement by copies</summary>
                        <table className="an-table">
                          <thead>
                            <tr>
                              <th>Copies</th>
                              <th className="an-num">Decks</th>
                              <th className="an-num">Top-8 rate</th>
                              <th className="an-num">95% CI</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cc.map((b) => (
                              <tr key={b.copies}>
                                <td>{b.copies === 0 ? 'Not played' : `${b.copies}×`}</td>
                                <td className="an-num">{b.n}</td>
                                <td className="an-num">{formatRateN(b.top8, b.n)}</td>
                                <td className="an-num">{formatInterval(b.top8, b.n, 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </details>
                    )}
                  </div>
                  <div className="card-row-stats">
                    <span className="card-row-incl" title={`${card.k}/${card.n} decks`}>
                      {formatPct(card.rate, 0)}
                      <span className="an-small"> · {card.k}/{card.n}</span>
                    </span>
                    <span className="card-row-price">{fmtMoney(ci.price)}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </>
  )
}

function VariantsPanel({ entries, legendName, onShowVariant }) {
  const res = useMemo(() => clusterVariants(entries), [entries])
  return (
    <div className="an-card">
      <h3>Variants</h3>
      <p className="an-sub">
        Lists clustered by card overlap (weighted Jaccard on main deck + rune split, k-medoids). The number
        of variants is picked automatically (silhouette score, at most 6, each with ≥ {MIN_SAMPLE.cluster} decks);
        it stays at one when the lists don&apos;t split cleanly. Each variant is named after the cards that set it
        apart. {res.k > 1 ? `Silhouette ${res.silhouette.toFixed(2)}.` : ''}
      </p>
      {res.variants.map((v) => (
        <div key={v.id} className="an-card" style={{ background: 'var(--bg-secondary)' }}>
          <div className="an-row" style={{ justifyContent: 'space-between' }}>
            <strong>{v.name}</strong>
            <span className="an-small">
              {v.size} decks · top-8 {formatRateN(v.top8.k, v.top8.n)} (95% CI {formatInterval(v.top8.k, v.top8.n, 0)})
            </span>
          </div>
          <div className="an-row an-small" style={{ margin: '8px 0' }}>
            {v.signature.map((c) => (
              <span key={c.name} className="an-badge" title={`${formatPct(c.rate, 0)} in this variant vs ${formatPct(c.outside, 0)} elsewhere`}>
                {c.name} {formatPct(c.rate, 0)}
              </span>
            ))}
          </div>
          <button type="button" className="an-btn an-btn--ghost" onClick={() => onShowVariant(legendName, v)}>
            Show these {v.size} decks
          </button>
        </div>
      ))}
    </div>
  )
}

function ConsensusPanel({ entries, info, lift, onSimulate }) {
  const variants = useMemo(() => clusterVariants(entries), [entries])
  const [source, setSource] = useState('legend')
  const [budget, setBudget] = useState('')
  const [copied, setCopied] = useState(false)

  const pool = useMemo(() => {
    if (source === 'legend') return entries
    const v = variants.variants.find((x) => x.id === source)
    const ids = new Set(v?.deckIds || [])
    return entries.filter((e) => ids.has(String(e.deck.deckId)))
  }, [source, entries, variants])

  const liftByName = useMemo(() => new Map([...lift.values()].map((l) => [l.name, l.lift])), [lift])
  const result = useMemo(
    () => consensusList(pool, info, { altEntries: entries, budget: Number(budget) || 0, liftByName }),
    [pool, info, entries, budget, liftByName]
  )
  const text = result.list ? deckToText(result.list) : ''
  const price = result.list ? listPrice(result.list, info) : null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="an-card">
      <h3>Consensus list</h3>
      <p className="an-sub">
        Built from the most-included cards (weighted by top-8 lists when there are ≥ 5): 40-card main deck
        including the champion, max 3 copies, 12 runes split by the average ratio, 3 battlefields and the
        pool&apos;s usual sideboard size. Budget mode swaps the priciest cards for the best-lift cheaper card of the
        same type within ±1 energy, drawn from all of this legend&apos;s lists.
      </p>
      <div className="an-row" style={{ marginBottom: 12 }}>
        <label className="filter-group">
          <span className="filter-label">Build from</span>
          <select className="filter-select" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="legend">All lists ({entries.length})</option>
            {variants.k > 1 &&
              variants.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Variant: {v.name} ({v.size})
                </option>
              ))}
          </select>
        </label>
        <label className="filter-group">
          <span className="filter-label">Max price ($)</span>
          <input className="an-input" type="number" min="0" step="10" placeholder="no limit" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
      </div>
      {!result.list ? (
        <div className="an-empty">{result.notes.join(' ')}</div>
      ) : (
        <>
          <div className="an-small" style={{ marginBottom: 8 }}>
            Based on {result.basisSize} {result.basisTop8 ? 'top-8 ' : ''}lists · est. price ${price.total.toFixed(2)}
            {price.unknown ? ` (+${price.unknown} cards without a price)` : ''}
          </div>
          {result.notes.map((n) => (
            <div key={n} className="an-small an-down">
              {n}
            </div>
          ))}
          {result.swaps?.length > 0 && (
            <ul className="an-small">
              {result.swaps.map((s) => (
                <li key={s.out}>
                  {s.copies}× {s.out} → {s.in} (saves ${s.saved.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
          <pre className="an-pre">{text}</pre>
          <div className="an-row" style={{ marginTop: 10 }}>
            <button type="button" className="an-btn" onClick={() => onSimulate(text, completeDeckDef(result.list, info))}>
              Simulate this deck
            </button>
            <button type="button" className="an-btn an-btn--ghost" onClick={copy}>
              {copied ? 'Copied!' : 'Copy list'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function BattlefieldsPanel({ entries }) {
  const rows = useMemo(() => sectionOutcomes(entries, 'battlefields'), [entries])
  return (
    <div className="an-card">
      <h3>Battlefields</h3>
      <p className="an-sub">How often each battlefield is chosen, and the top-8 rate of decks that chose it.</p>
      <table className="an-table">
        <thead>
          <tr>
            <th>Battlefield</th>
            <th className="an-num">Chosen</th>
            <th className="an-num">Top-8 rate when chosen</th>
            <th className="an-num">95% CI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.top8.n < MIN_SAMPLE.cardDecks ? 'an-faded' : ''}>
              <td>{r.name}</td>
              <td className="an-num">{formatRateN(r.k, r.n)}</td>
              <td className="an-num">{formatRateN(r.top8.k, r.top8.n)}</td>
              <td className="an-num">{formatInterval(r.top8.k, r.top8.n, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SideboardPanel({ entries, scoped, legendName }) {
  const freq = useMemo(() => cardInclusion(entries, 'sideboard'), [entries])
  const weekly = useMemo(() => weeklyInclusion(entries, 'sideboard', weekStart), [entries])

  // Field composition per event, from every scoped deck (not only card lists).
  const { shares, opponents } = useMemo(() => {
    const byEvent = new Map()
    const totals = new Map()
    for (const d of scoped) {
      const k = tournamentKey(d)
      if (!byEvent.has(k)) byEvent.set(k, new Map())
      const m = byEvent.get(k)
      m.set(d.legendName, (m.get(d.legendName) || 0) + 1)
      totals.set(d.legendName, (totals.get(d.legendName) || 0) + 1)
    }
    const shareMap = new Map()
    for (const [k, m] of byEvent) {
      const n = [...m.values()].reduce((a, b) => a + b, 0)
      shareMap.set(k, new Map([...m.entries()].map(([l, c]) => [l, c / n])))
    }
    const opp = [...totals.entries()].filter(([l]) => l !== legendName).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l]) => l)
    return { shares: shareMap, opponents: opp }
  }, [scoped, legendName])

  const corr = useMemo(() => sideboardFieldCorrelation(entries, shares, tournamentKey, { opponents }), [entries, shares, opponents])
  const notable = corr.rows.filter((r) => r.p < 0.05).slice(0, 12)

  return (
    <>
      <div className="an-card">
        <h3>Sideboard frequency</h3>
        <p className="an-sub">Share of lists running each sideboard card, overall and by week (k/n per week).</p>
        <div className="an-table-wrap">
          <table className="an-table">
            <thead>
              <tr>
                <th>Card</th>
                <th className="an-num">Overall</th>
                {weekly.weeks.map((w, i) => (
                  <th key={w} className="an-num">
                    {w.slice(5)} <span className="an-small">({weekly.n[i]})</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {freq.slice(0, 25).map((c) => (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td className="an-num">{formatRateN(c.k, c.n, 0)}</td>
                  {weekly.weeks.map((w, i) => {
                    const k = weekly.cards.get(c.name)?.k[i] || 0
                    return (
                      <td key={w} className="an-num">
                        {weekly.n[i] ? `${k}/${weekly.n[i]}` : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="an-card">
        <h3>Sideboard vs the field</h3>
        <p className="an-sub">
          Correlation between running a sideboard card and the share of a popular opposing legend in that
          deck&apos;s event (point-biserial r across lists; needs ≥ 20 lists). Positive r = the card shows up more
          where that legend is common. Correlation, not proof of intent.
        </p>
        {!corr.enough ? (
          <div className="an-empty">Only {corr.n} lists with card data — at least 20 are needed for this analysis.</div>
        ) : !notable.length ? (
          <div className="an-empty">No sideboard card is significantly associated (p &lt; 0.05) with any top opposing legend across {corr.n} lists.</div>
        ) : (
          <table className="an-table">
            <thead>
              <tr>
                <th>Sideboard card</th>
                <th>Opposing legend</th>
                <th className="an-num">r</th>
                <th className="an-num">p</th>
                <th className="an-num">Lists with card</th>
              </tr>
            </thead>
            <tbody>
              {notable.map((r) => (
                <tr key={`${r.card}|${r.opponent}`}>
                  <td>{r.card}</td>
                  <td>{short(r.opponent)}</td>
                  <td className={`an-num ${r.r > 0 ? 'an-up' : 'an-down'}`}>{r.r.toFixed(2)}</td>
                  <td className="an-num">{r.p < 0.001 ? '<0.001' : r.p.toFixed(3)}</td>
                  <td className="an-num">
                    {r.k}/{r.n}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
