import { useEffect } from 'react'
import { getGuide } from '../content/guides'
import './GuidesView.css'

const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })

function Block({ block }) {
  switch (block.type) {
    case 'h2':
      return <h2>{block.text}</h2>
    case 'ul':
      return (
        <ul>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol>
          {block.items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ol>
      )
    case 'quote':
      return <blockquote className="guide-quote">{block.text}</blockquote>
    case 'p':
    default:
      return <p>{block.text}</p>
  }
}

export default function GuideArticle({ slug, onBack, onBackToList }) {
  const guide = getGuide(slug)

  useEffect(() => {
    if (guide) document.title = `${guide.title} · RiftDecks Browser`
    return () => {
      document.title = 'RiftDecks Browser'
    }
  }, [guide])

  if (!guide) {
    return (
      <div className="guide-article">
        <button type="button" className="legal-back" onClick={onBackToList}>
          ← All guides
        </button>
        <div className="app-status">That guide could not be found.</div>
      </div>
    )
  }

  return (
    <article className="guide-article">
      <button type="button" className="legal-back" onClick={onBackToList}>
        ← All guides
      </button>

      <header className="guide-article-head">
        <h1>{guide.title}</h1>
        <div className="guide-article-meta">
          <span>Published {fmtDate(guide.date)}</span>
          {guide.updated && guide.updated !== guide.date && (
            <>
              <span className="guide-card-dot">·</span>
              <span>Updated {fmtDate(guide.updated)}</span>
            </>
          )}
          <span className="guide-card-dot">·</span>
          <span>{guide.readingMinutes} min read</span>
        </div>
        <p className="guide-article-lead">{guide.description}</p>
      </header>

      <div className="guide-article-body">
        {guide.body.map((block, i) => (
          <Block key={i} block={block} />
        ))}
      </div>

      <div className="guide-article-foot">
        <button type="button" className="legal-back" onClick={onBackToList}>
          ← Back to all guides
        </button>
      </div>
    </article>
  )
}
