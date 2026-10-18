import { useMemo, useState } from 'react'
import AnalyticsBar, { MinSampleControl } from './AnalyticsBar'
import DataSourceNote from './DataSourceNote'
import MultiLineChart, { SERIES_VARS, MAX_SERIES } from './MultiLineChart'
import { applyScope, describeScope, countEvents } from '../data/scope'
import { weeklyShares, momentum, weekStart, legendCounts } from '../analytics/metaStats'
import { entriesFor, weeklyInclusion, earlyMovers, newSetAdoption, cardInfo } from '../analytics/cardAnalysis'
import { formatPct, formatRateN, MIN_SAMPLE } from '../stats/stats'
import './MetaView.css'
import './Analytics.css'

const short = (name) => (name || '').split(',')[0]
const fmtWeek = (w) => new Date(w + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const SKIP = ['legends', 'maxPlacement', 'maxPlacePct', 'maxPrice']

export default function TrendsView({ allDecks, scope, onScopeChange, legendOptions, metaOptions, coverage, deckCards }) {
  const [minN, setMinN] = useState(MIN_SAMPLE.legendDecks)
  const lists = deckCards?.data?.lists
  const info = deckCards?.data?.info

  const decks = useMemo(() => applyScope(allDecks, scope, { skip: SKIP, coverage }), [allDecks, scope, coverage])
  const weekly = useMemo(() => weeklyShares(decks), [decks])
  const counts = useMemo(() => legendCounts(decks), [decks])

  // Series: selected legends (max 6) or the six most-played. Slots follow the
  // legends' all-data popularity order so a legend keeps its colour.
  const globalOrder = useMemo(() => legendCounts(allDecks).map((r) => r.name), [allDecks])
  const chosen = (scope.legends?.length ? scope.legends : counts.map((r) => r.name)).slice(0, MAX_SERIES)
  const ordered = [...chosen].sort((a, b) => globalOrder.indexOf(a) - globalOrder.indexOf(b))
  const series = ordered.map((name, i) => {
    const s = weekly.series.get(name)
    return {
      name: short(name),
      color: SERIES_VARS[i],
      values: weekly.weeks.map((_, w) => (s && weekly.totals[w] ? s.share[w] : null)),
      counts: weekly.weeks.map((_, w) => `${s?.k[w] || 0}/${weekly.totals[w]}`),
    }
  })

  const moves = useMemo(
    () =>
      counts
        .filter((r) => r.decks >= minN)
        .map((r) => ({ ...r, m: momentum(weekly, r.name) }))
        .sort((a, b) => (b.m.label === 'steady' ? 0 : 1) - (a.m.label === 'steady' ? 0 : 1) || b.m.slope - a.m.slope),
    [counts, weekly, minN]
  )

  return (
    <section className="meta-view">
      <header className="meta-intro">
        <h1 className="meta-intro-title">Meta Trends</h1>
        <p className="meta-intro-text">
          How the field is moving week to week: legend share over time with a rising/falling indicator, cards whose
          top-8 adoption is outpacing their overall adoption, and what the newest set&apos;s preview events look like.
        </p>
      </header>

      <AnalyticsBar scope={scope} onScopeChange={onScopeChange} legendOptions={legendOptions} metaOptions={metaOptions}>
        <MinSampleControl value={minN} onChange={setMinN} label="Min. decks" options={[5, 10, 20, 50]} />
      </AnalyticsBar>

      <DataSourceNote
        dataset="placements"
        filters={describeScope(scope, { skip: SKIP })}
        counts={`${decks.length.toLocaleString()} decks · ${countEvents(decks)} events · ${weekly.weeks.length} weeks`}
        extra={weekly.weeks.length < 4 ? 'Fewer than 4 weeks in scope — widen the date range (90d / All) for a clearer trend.' : null}
      />

      <article className="an-card">
        <h2>Weekly share by legend</h2>
        <p className="an-sub">
          Share of each week&apos;s decks (weeks start Monday). Pick up to {MAX_SERIES} legends with the Legend filter; hover for
          k/n per week.
        </p>
        <MultiLineChart xLabels={weekly.weeks} series={series} formatY={(v) => formatPct(v, 0)} formatX={fmtWeek} />
      </article>

      <article className="an-card">
        <h2>Momentum</h2>
        <p className="an-sub">
          Share in the last 2 weeks vs the weeks before, tested with a two-proportion z-test: <span className="an-up">rising</span>{' '}
          / <span className="an-down">falling</span> only when p &lt; 0.05, otherwise steady. Slope = change in share per week
          (least squares). Legends with ≥ {minN} decks.
        </p>
        <div className="an-table-wrap">
          <table className="an-table">
            <thead>
              <tr>
                <th>Legend</th>
                <th className="an-num">Share (all)</th>
                <th className="an-num">Earlier</th>
                <th className="an-num">Last 2 weeks</th>
                <th className="an-num">Slope / wk</th>
                <th>Momentum</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((r) => (
                <tr key={r.name}>
                  <td title={r.name}>{short(r.name)}</td>
                  <td className="an-num">{formatRateN(r.decks, decks.length)}</td>
                  <td className="an-num">{r.m.earlier ? formatRateN(r.m.earlier.k, r.m.earlier.n) : '—'}</td>
                  <td className="an-num">{r.m.recent ? formatRateN(r.m.recent.k, r.m.recent.n) : '—'}</td>
                  <td className="an-num">
                    {r.m.slope >= 0 ? '+' : ''}
                    {(r.m.slope * 100).toFixed(2)} pts
                  </td>
                  <td>
                    <span
                      className={`an-badge ${r.m.label === 'rising' ? 'an-badge--good' : r.m.label === 'falling' ? 'an-badge--bad' : ''}`}
                      title={`p = ${r.m.p.toFixed(3)}`}
                    >
                      {r.m.label === 'rising' ? '▲ rising' : r.m.label === 'falling' ? '▼ falling' : 'steady'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <CardAdoption decks={decks} lists={lists} info={info} counts={counts} loading={deckCards?.loading} />
      <NewSetTracker allDecks={allDecks} scope={scope} coverage={coverage} lists={lists} info={info} />
    </section>
  )
}

function CardAdoption({ decks, lists, info, counts, loading }) {
  const withLists = useMemo(() => {
    if (!lists) return []
    const n = new Map()
    for (const d of decks) if (lists.has(String(d.deckId))) n.set(d.legendName, (n.get(d.legendName) || 0) + 1)
    return counts.map((r) => ({ name: r.name, lists: n.get(r.name) || 0 })).filter((r) => r.lists > 0).sort((a, b) => b.lists - a.lists)
  }, [decks, lists, counts])
  const [legend, setLegend] = useState(null)
  const active = legend || withLists[0]?.name || null

  const result = useMemo(() => {
    if (!active || !lists) return null
    const entries = entriesFor(decks.filter((d) => d.legendName === active), lists)
    const weekly = weeklyInclusion(entries, 'main', weekStart)
    return { entries, weekly, movers: earlyMovers(weekly) }
  }, [active, decks, lists])

  return (
    <article className="an-card">
      <h2>Card adoption &amp; early movers</h2>
      <p className="an-sub">
        Weekly inclusion of each card in a legend&apos;s lists. <strong>Early movers</strong> are cards whose top-8 inclusion
        is rising faster than their overall inclusion (weighted slope gap ≥ 3 points/week) — winners adopting a card before
        the rest of the field. Needs ≥ 3 weeks and ≥ 10 top-8 lists.
      </p>
      {loading ? (
        <div className="an-empty">Loading card lists…</div>
      ) : !withLists.length ? (
        <div className="an-empty">No decks in scope have card lists yet.</div>
      ) : (
        <>
          <label className="filter-group" style={{ marginBottom: 10 }}>
            <span className="filter-label">Legend</span>
            <select className="filter-select" value={active} onChange={(e) => setLegend(e.target.value)}>
              {withLists.map((l) => (
                <option key={l.name} value={l.name}>
                  {short(l.name)} ({l.lists} lists)
                </option>
              ))}
            </select>
          </label>
          {result && !result.movers.enough ? (
            <div className="an-empty">
              {short(active)} has {result.entries.length} lists ({result.weekly.n8.reduce((a, b) => a + b, 0)} top-8) across{' '}
              {result.weekly.weeks.length} weeks — not enough to measure adoption curves.
            </div>
          ) : result && !result.movers.rows.length ? (
            <div className="an-empty">No card&apos;s top-8 adoption is outpacing its overall adoption.</div>
          ) : (
            result && (
              <table className="an-table">
                <thead>
                  <tr>
                    <th>Card</th>
                    <th className="an-num">Top-8 slope / wk</th>
                    <th className="an-num">Overall slope / wk</th>
                    <th className="an-num">Lists with card (top-8 / all)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.movers.rows.slice(0, 15).map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="an-num an-up">+{(r.slopeTop * 100).toFixed(1)} pts</td>
                      <td className="an-num">
                        {r.slopeAll >= 0 ? '+' : ''}
                        {(r.slopeAll * 100).toFixed(1)} pts
                      </td>
                      <td className="an-num">
                        {r.k8} / {r.k}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </>
      )}
    </article>
  )
}

function NewSetTracker({ allDecks, scope, coverage, lists, info }) {
  // Newest set = the meta whose first event is most recent.
  const sets = useMemo(() => {
    const first = new Map()
    for (const d of allDecks) {
      if (!d.metaSet || !d.tournamentDate) continue
      const t = d.tournamentDate.getTime()
      if (!first.has(d.metaSet) || t < first.get(d.metaSet)) first.set(d.metaSet, t)
    }
    return [...first.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  }, [allDecks])
  const newest = sets[0]

  const data = useMemo(() => {
    if (!newest) return null
    const decks = applyScope(allDecks, { ...scope, meta: newest }, { skip: SKIP, coverage })
    const entries = lists ? entriesFor(decks, lists) : []
    // "New" card = its set code never appears in lists from other metas.
    let newCodes = []
    if (lists && info) {
      const older = new Set()
      const inNew = new Set()
      const newIds = new Set(decks.map((d) => String(d.deckId)))
      for (const d of allDecks) {
        const l = lists.get(String(d.deckId))
        if (!l) continue
        for (const name of l.main.keys()) {
          const set = cardInfo(info, 'main', name).set
          if (!set) continue
          if (newIds.has(String(d.deckId)) || d.metaSet === newest) inNew.add(set)
          else older.add(set)
        }
      }
      newCodes = [...inNew].filter((s) => !older.has(s))
    }
    return {
      decks,
      events: countEvents(decks),
      legends: legendCounts(decks),
      entries,
      newCodes,
      adoption: entries.length && newCodes.length ? newSetAdoption(entries, info, newCodes) : [],
    }
  }, [newest, allDecks, scope, coverage, lists, info])

  if (!data) return null
  return (
    <article className="an-card">
      <h2>New-set tracker: {newest}</h2>
      <p className="an-sub">
        Preview / early events of the newest set ({data.events} events, {data.decks.length} decks in scope, ignoring the Meta
        filter). Legend share shows who is testing the new format; card adoption needs card lists from these events.
      </p>
      {!data.decks.length ? (
        <div className="an-empty">No {newest} events in the current date/region scope.</div>
      ) : (
        <div className="an-grid-2">
          <div>
            <h3>Legends in {newest} events</h3>
            <table className="an-table">
              <tbody>
                {data.legends.slice(0, 12).map((r) => (
                  <tr key={r.name}>
                    <td title={r.name}>{short(r.name)}</td>
                    <td className="an-num">{formatRateN(r.decks, data.decks.length)}</td>
                    <td className="an-num an-small">T8 {formatRateN(r.top8, r.decks, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>New cards being adopted</h3>
            {!data.entries.length ? (
              <div className="an-empty">
                None of the {data.decks.length} {newest} decks have a scraped card list yet, so new-card adoption can&apos;t be
                measured.
              </div>
            ) : !data.newCodes.length ? (
              <div className="an-empty">No cards from a set unseen in earlier lists ({data.entries.length} lists checked).</div>
            ) : (
              data.adoption
                .filter((a) => a.cards.length)
                .slice(0, 8)
                .map((a) => (
                  <div key={a.legend} style={{ marginBottom: 10 }}>
                    <strong>{short(a.legend)}</strong>{' '}
                    <span className="an-small">
                      {a.decksWithNew}/{a.decks} lists use new cards
                    </span>
                    <div className="an-row an-small">
                      {a.cards.slice(0, 6).map((c) => (
                          <span key={c.name} className="an-badge">
                            {c.name} {formatRateN(c.k, c.n, 0)}
                          </span>
                        ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      )}
    </article>
  )
}
