import './PrivacyPolicy.css'

export default function AboutView({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
          <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
        </svg>
        Home
      </button>

      <h1>About RiftDecks Browser</h1>

      <div className="legal-disclaimer">
        <strong>Disclaimer:</strong> This is an unofficial, fan-made site provided for
        informational purposes only. RiftDecks Browser is not affiliated with,
        endorsed by, or associated with{' '}
        <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
          riftDecks.com
        </a>{' '}
        or Riot Games. All deck and tournament data is publicly sourced and remains
        the property of its respective owners.
      </div>

      <p>
        RiftDecks Browser is a free, fan-made tool that makes it easy to browse, filter,
        and analyse competitive <strong>Riftbound</strong> tournament decks. We collect
        publicly available results, organise them by legend, placement, date, and price,
        and surface meta trends so players can quickly understand what is winning.
      </p>

      <h2>What you can do here</h2>
      <ul>
        <li>Filter top tournament decks by legend, recency, placement, and deck price.</li>
        <li>Save decks to a local favourites list that stays in your browser.</li>
        <li>
          Explore the <strong>Meta dashboard</strong> for legend popularity, 1st-place
          rates, and average deck-price trends over time.
        </li>
      </ul>

      <h2>Where the data comes from</h2>
      <p>
        Deck and tournament data is sourced from publicly available results on{' '}
        <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
          riftdecks.com
        </a>
        . Data is refreshed daily. Older tournaments are pruned to keep the meta view
        focused on what is currently relevant.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, corrections, or suggestions? Reach us at{' '}
        <a href="mailto:contact@bestriftdecks.xyz">contact@bestriftdecks.xyz</a>.
      </p>
    </div>
  )
}
