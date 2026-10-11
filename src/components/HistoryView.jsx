import { useEffect, useMemo, useState } from 'react'
import useDeckHistory from '../hooks/useDeckHistory'
import useLegendCards from '../hooks/useLegendCards'
import './HistoryView.css'

// Common match scores (Best-of-3 first, then Best-of-1 and the 1-1 split).
const SCORES = [
  { yourGames: 2, oppGames: 0, label: '2 - 0 (Win)' },
  { yourGames: 2, oppGames: 1, label: '2 - 1 (Win)' },
  { yourGames: 1, oppGames: 2, label: '1 - 2 (Loss)' },
  { yourGames: 0, oppGames: 2, label: '0 - 2 (Loss)' },
  { yourGames: 1, oppGames: 0, label: '1 - 0 (Win)' },
  { yourGames: 0, oppGames: 1, label: '0 - 1 (Loss)' },
  { yourGames: 1, oppGames: 1, label: '1 - 1 (Draw)' },
]

// Score string for a logged match; blank for older results saved without games.
function scoreLabel(m) {
  if (m.yourGames == null || m.oppGames == null) return '—'
  return `${m.yourGames} - ${m.oppGames}`
}

function tally(matches) {
  const r = { win: 0, loss: 0, draw: 0 }
  for (const m of matches) {
    if (r[m.result] != null) r[m.result] += 1
  }
  return r
}

// Win rate over decisive games (draws excluded from the denominator).
function winRate(r) {
  const decisive = r.win + r.loss
  if (!decisive) return null
  return Math.round((r.win / decisive) * 100)
}

function recordLabel(r) {
  return `${r.win}-${r.loss}${r.draw ? `-${r.draw}` : ''}`
}

function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Aggregate a deck's matches by the opponent legend faced.
function matchupStats(matches) {
  const map = new Map()
  for (const m of matches) {
    const key = m.opponent || 'Unknown'
    if (!map.has(key)) map.set(key, { win: 0, loss: 0, draw: 0 })
    const r = map.get(key)
    if (r[m.result] != null) r[m.result] += 1
  }
  return [...map.entries()]
    .map(([opponent, r]) => ({ opponent, ...r, rate: winRate(r) }))
    .sort((a, b) => b.win + b.loss + b.draw - (a.win + a.loss + a.draw))
}

function DeckForm({ initial, legendNames, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [legend, setLegend] = useState(initial?.legend ?? '')
  const [cards, setCards] = useState(initial?.cards ?? '')

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name, legend, cards })
  }

  return (
    <form className="hist-form" onSubmit={submit}>
      <div className="hist-form-row">
        <label className="hist-field">
          <span className="hist-label">Deck name</span>
          <input
            className="hist-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reksai Aggro"
            autoFocus
          />
        </label>
        <label className="hist-field">
          <span className="hist-label">Legend</span>
          <input
            className="hist-input"
            list="hist-legend-list"
            value={legend}
            onChange={(e) => setLegend(e.target.value)}
            placeholder="Your deck's legend"
          />
        </label>
      </div>
      <label className="hist-field">
        <span className="hist-label">Cards</span>
        <textarea
          className="hist-textarea"
          value={cards}
          onChange={(e) => setCards(e.target.value)}
          rows={8}
          placeholder={'One card per line, e.g.\n3 Cleave\n2 Ferrous Forerunner\n...'}
        />
      </label>
      <datalist id="hist-legend-list">
        {legendNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="hist-form-actions">
        <button type="button" className="hist-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="hist-btn hist-btn--primary">
          Save deck
        </button>
      </div>
    </form>
  )
}

function MatchForm({ legendNames, onAdd }) {
  const [opponent, setOpponent] = useState('')
  const [scoreIdx, setScoreIdx] = useState(0)
  const [notes, setNotes] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const score = SCORES[scoreIdx]
    onAdd({ opponent, yourGames: score.yourGames, oppGames: score.oppGames, notes })
    setOpponent('')
    setNotes('')
    setScoreIdx(0)
  }

  return (
    <form className="hist-match-form" onSubmit={submit}>
      <label className="hist-field hist-field--grow">
        <span className="hist-label">Opponent legend</span>
        <input
          className="hist-input"
          list="hist-legend-list"
          value={opponent}
          onChange={(e) => setOpponent(e.target.value)}
          placeholder="Who did you play against?"
        />
      </label>
      <label className="hist-field">
        <span className="hist-label">Score</span>
        <select
          className="hist-input"
          value={scoreIdx}
          onChange={(e) => setScoreIdx(Number(e.target.value))}
        >
          {SCORES.map((s, i) => (
            <option key={s.label} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="hist-field hist-field--grow">
        <span className="hist-label">Notes</span>
        <input
          className="hist-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </label>
      <datalist id="hist-legend-list">
        {legendNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <button type="submit" className="hist-btn hist-btn--primary hist-match-add">
        Add result
      </button>
    </form>
  )
}

function DeckDetail({ deck, legendNames, onBack, onEdit, onDelete, onAddMatch, onRemoveMatch }) {
  const record = useMemo(() => tally(deck.matches), [deck.matches])
  const rate = winRate(record)
  const matchups = useMemo(() => matchupStats(deck.matches), [deck.matches])

  return (
    <div className="hist-detail">
      <button type="button" className="hist-back" onClick={onBack}>
        ← All decks
      </button>

      <div className="hist-detail-head">
        <div>
          <h2 className="hist-detail-title">{deck.name}</h2>
          {deck.legend && <p className="hist-detail-legend">{deck.legend}</p>}
        </div>
        <div className="hist-detail-tools">
          <button type="button" className="hist-btn" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="hist-btn hist-btn--danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>

      <div className="hist-stats">
        <div className="hist-stat">
          <span className="hist-stat-value">{deck.matches.length}</span>
          <span className="hist-stat-label">Games</span>
        </div>
        <div className="hist-stat">
          <span className="hist-stat-value">{recordLabel(record)}</span>
          <span className="hist-stat-label">Record (W-L-D)</span>
        </div>
        <div className="hist-stat">
          <span className="hist-stat-value">{rate == null ? '—' : `${rate}%`}</span>
          <span className="hist-stat-label">Win rate</span>
        </div>
      </div>

      {deck.cards?.trim() && (
        <details className="hist-cards">
          <summary>Deck list</summary>
          <pre className="hist-cards-pre">{deck.cards}</pre>
        </details>
      )}

      <section className="hist-section">
        <h3 className="hist-section-title">Record a result</h3>
        <MatchForm legendNames={legendNames} onAdd={(m) => onAddMatch(deck.id, m)} />
      </section>

      {matchups.length > 0 && (
        <section className="hist-section">
          <h3 className="hist-section-title">By opponent</h3>
          <div className="hist-table-wrap">
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Opponent legend</th>
                  <th>Games</th>
                  <th>Record</th>
                  <th>Win rate</th>
                </tr>
              </thead>
              <tbody>
                {matchups.map((mu) => (
                  <tr key={mu.opponent}>
                    <td>{mu.opponent}</td>
                    <td className="hist-col-num">{mu.win + mu.loss + mu.draw}</td>
                    <td className="hist-col-num">{recordLabel(mu)}</td>
                    <td className="hist-col-num">{mu.rate == null ? '—' : `${mu.rate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="hist-section">
        <h3 className="hist-section-title">Match log</h3>
        {deck.matches.length === 0 ? (
          <p className="hist-empty-hint">No games recorded yet.</p>
        ) : (
          <div className="hist-table-wrap">
            <table className="hist-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Opponent</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deck.matches.map((m) => (
                  <tr key={m.id}>
                    <td className="hist-col-nowrap">{formatDate(m.date)}</td>
                    <td>{m.opponent || '—'}</td>
                    <td className="hist-col-nowrap hist-col-score">{scoreLabel(m)}</td>
                    <td>
                      <span className={`hist-result hist-result--${m.result}`}>
                        {m.result}
                      </span>
                    </td>
                    <td className="hist-col-notes">{m.notes || '—'}</td>
                    <td className="hist-col-link">
                      <button
                        type="button"
                        className="hist-remove"
                        onClick={() => onRemoveMatch(deck.id, m.id)}
                        title="Remove this result"
                        aria-label="Remove this result"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// Global "Record result" bar: pick which of your decks you used, the opponent
// legend, the Bo3 score, and optional notes.
function RecordResultBar({ decks, legendNames, onSave }) {
  const [deckId, setDeckId] = useState(decks[0]?.id ?? '')
  const [opponent, setOpponent] = useState('')
  const [scoreIdx, setScoreIdx] = useState(0)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  // Keep a valid deck selected as decks are added or removed.
  useEffect(() => {
    if (!decks.some((d) => d.id === deckId)) setDeckId(decks[0]?.id ?? '')
  }, [decks, deckId])

  const submit = (e) => {
    e.preventDefault()
    if (!deckId) return
    const score = SCORES[scoreIdx]
    onSave(deckId, { opponent, yourGames: score.yourGames, oppGames: score.oppGames, notes })
    setOpponent('')
    setNotes('')
    setScoreIdx(0)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  return (
    <section className="hist-section hist-record">
      <h3 className="hist-section-title">Record result</h3>
      <form className="hist-match-form" onSubmit={submit}>
        <label className="hist-field hist-field--grow">
          <span className="hist-label">Legend faced</span>
          <input
            className="hist-input"
            list="hist-legend-list"
            value={opponent}
            onChange={(e) => setOpponent(e.target.value)}
            placeholder="Opponent legend"
          />
        </label>
        <label className="hist-field">
          <span className="hist-label">Result</span>
          <select
            className="hist-input"
            value={scoreIdx}
            onChange={(e) => setScoreIdx(Number(e.target.value))}
          >
            {SCORES.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="hist-field hist-field--grow">
          <span className="hist-label">Notes</span>
          <input
            className="hist-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="hist-field hist-field--grow">
          <span className="hist-label">Used deck</span>
          <select
            className="hist-input"
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.legend ? `${d.legend} — ${d.name}` : d.name}
              </option>
            ))}
          </select>
        </label>
        <datalist id="hist-legend-list">
          {legendNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <button type="submit" className="hist-btn hist-btn--primary hist-match-add">
          {saved ? 'Saved ✓' : 'Save'}
        </button>
      </form>
    </section>
  )
}

export default function HistoryView() {
  const { decks, addDeck, updateDeck, removeDeck, addMatch, removeMatch } = useDeckHistory()
  const { data } = useLegendCards()
  const [selectedId, setSelectedId] = useState(null)
  const [mode, setMode] = useState('list') // 'list' | 'create' | 'edit'
  const [createLegend, setCreateLegend] = useState('')

  const legendNames = useMemo(
    () => (data?.legends || []).map((l) => l.legendName).sort((a, b) => a.localeCompare(b)),
    [data]
  )

  const selected = decks.find((d) => d.id === selectedId) || null

  // Your decks grouped by their legend, with each group's combined record.
  const legendGroups = useMemo(() => {
    const map = new Map()
    for (const d of decks) {
      const key = d.legend?.trim() || 'No legend'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(d)
    }
    return [...map.entries()]
      .map(([legend, groupDecks]) => {
        const allMatches = groupDecks.flatMap((d) => d.matches)
        const record = tally(allMatches)
        return {
          legend,
          decks: groupDecks,
          record,
          rate: winRate(record),
          games: allMatches.length,
        }
      })
      .sort((a, b) => b.games - a.games || a.legend.localeCompare(b.legend))
  }, [decks])

  const startCreate = (legend = '') => {
    setCreateLegend(legend)
    setMode('create')
  }

  const handleCreate = ({ name, legend, cards }) => {
    const deck = addDeck({ name, legend, cards })
    setCreateLegend('')
    setMode('list')
    return deck
  }

  const handleEdit = ({ name, legend, cards }) => {
    updateDeck(selectedId, { name: name.trim() || 'Untitled deck', legend: legend.trim(), cards })
    setMode('list')
  }

  const handleDelete = () => {
    if (!selected) return
    if (!window.confirm(`Delete "${selected.name}" and its match history?`)) return
    removeDeck(selected.id)
    setSelectedId(null)
  }

  if (mode === 'create') {
    return (
      <div className="hist-view">
        <h2 className="hist-title">New deck</h2>
        <DeckForm
          initial={createLegend ? { legend: createLegend } : undefined}
          legendNames={legendNames}
          onSave={handleCreate}
          onCancel={() => {
            setCreateLegend('')
            setMode('list')
          }}
        />
      </div>
    )
  }

  if (mode === 'edit' && selected) {
    return (
      <div className="hist-view">
        <h2 className="hist-title">Edit deck</h2>
        <DeckForm
          initial={selected}
          legendNames={legendNames}
          onSave={handleEdit}
          onCancel={() => setMode('list')}
        />
      </div>
    )
  }

  if (selected) {
    return (
      <div className="hist-view">
        <DeckDetail
          deck={selected}
          legendNames={legendNames}
          onBack={() => setSelectedId(null)}
          onEdit={() => setMode('edit')}
          onDelete={handleDelete}
          onAddMatch={addMatch}
          onRemoveMatch={removeMatch}
        />
      </div>
    )
  }

  return (
    <div className="hist-view">
      <div className="hist-head">
        <div>
          <h2 className="hist-title">Deck history</h2>
          <p className="hist-sub">
            A running summary of your legends. Add the decks you play, then record each game's
            result and the legend you faced. Everything is stored locally in your browser.
          </p>
        </div>
        <button type="button" className="hist-btn hist-btn--primary" onClick={() => startCreate()}>
          + Add deck
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="hist-empty">
          <p>No decks tracked yet.</p>
          <p className="hist-empty-hint">
            Add a deck, then record results as you play.
          </p>
        </div>
      ) : (
        <>
          <RecordResultBar decks={decks} legendNames={legendNames} onSave={addMatch} />

          {legendGroups.map((group) => (
            <section key={group.legend} className="hist-legend-group">
              <div className="hist-legend-head">
                <div className="hist-legend-heading">
                  <h3 className="hist-legend-name">{group.legend}</h3>
                  <span className="hist-legend-stat">
                    {group.games} game{group.games !== 1 ? 's' : ''} · {recordLabel(group.record)}
                    {group.rate != null ? ` · ${group.rate}%` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  className="hist-btn"
                  onClick={() => startCreate(group.legend === 'No legend' ? '' : group.legend)}
                >
                  + Add deck
                </button>
              </div>
              <div className="hist-deck-rows">
                {group.decks.map((deck) => {
                  const record = tally(deck.matches)
                  const rate = winRate(record)
                  return (
                    <button
                      key={deck.id}
                      type="button"
                      className="hist-deck-row"
                      onClick={() => setSelectedId(deck.id)}
                    >
                      <span className="hist-deck-row-name">{deck.name}</span>
                      <span className="hist-deck-row-meta">
                        <span>{deck.matches.length} game{deck.matches.length !== 1 ? 's' : ''}</span>
                        <span className="hist-card-record">{recordLabel(record)}</span>
                        <span className="hist-card-rate">{rate == null ? '—' : `${rate}%`}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  )
}
