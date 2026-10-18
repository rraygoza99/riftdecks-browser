import './Analytics.css'

/**
 * One-line "Data source & filters" note shown on every analytics page.
 * dataset: 'placements' | 'matches' | 'cards' (or any custom label).
 */
const DATASETS = {
  placements: 'Tournament placements (riftdecks.com)',
  matches: 'riftDecks head-to-head match results',
  cards: 'Tournament decklists with card data',
}

export default function DataSourceNote({ dataset = 'placements', filters, counts, extra }) {
  return (
    <p className="an-note">
      <strong>Data source &amp; filters:</strong> {DATASETS[dataset] || dataset}
      {filters ? ` · ${filters}` : ''}
      {counts ? ` · ${counts}` : ''}
      {extra ? <span className="an-note-extra"> {extra}</span> : null}
    </p>
  )
}
