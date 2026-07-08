import { GUIDES } from '../content/guides'
import './GuidesView.css'

const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

export default function GuidesView({ onOpen }) {
  return (
    <section className="guides-view">
      <header className="guides-head">
        <h1 className="guides-title">Riftbound Guides &amp; Meta Reports</h1>
        <p className="guides-sub">
          Original articles on reading the competitive Riftbound meta, interpreting tournament
          results, and building strong decks without overspending. Written to help you get more
          out of the data on this site.
        </p>
      </header>

      <ul className="guides-list">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <button type="button" className="guide-card" onClick={() => onOpen(g.slug)}>
              <h2 className="guide-card-title">{g.title}</h2>
              <p className="guide-card-desc">{g.description}</p>
              <div className="guide-card-meta">
                <span>{fmtDate(g.date)}</span>
                <span className="guide-card-dot">·</span>
                <span>{g.readingMinutes} min read</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
