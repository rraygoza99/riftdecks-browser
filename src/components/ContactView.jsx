import './PrivacyPolicy.css'

export default function ContactView({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
          <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
        </svg>
        Home
      </button>

      <h1>Contact</h1>

      <p>
        RiftDecks Browser is run by a single Riftbound fan. We welcome questions,
        bug reports, data corrections, and feature suggestions.
      </p>

      <h2>Email</h2>
      <p>
        The best way to reach us is by email:{' '}
        <a href="mailto:contact@bestriftdecks.xyz">contact@bestriftdecks.xyz</a>
      </p>

      <h2>Reporting a data issue</h2>
      <p>
        If a deck, price, or tournament result looks wrong, please include a link to the
        deck and a short description of the problem so we can verify it against the
        original source.
      </p>

      <div className="legal-disclaimer">
        <strong>Disclaimer:</strong> RiftDecks Browser is an unofficial, fan-made site and
        is not affiliated with, endorsed by, or associated with{' '}
        <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
          riftDecks.com
        </a>{' '}
        or Riot Games.
      </div>
    </div>
  )
}
