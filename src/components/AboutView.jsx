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

      <h2>How we build the analysis (methodology)</h2>
      <p>
        We try to be transparent about exactly what our numbers measure. Each day we
        collect competitive tournament results — the finishing placement, the legend
        played, the event name and date, and an estimated market price for each list.
        We then clean the data before it ever reaches you:
      </p>
      <ul>
        <li>
          <strong>Recency:</strong> tournaments older than roughly six weeks are removed
          so the meta reflects the current format rather than a past patch.
        </li>
        <li>
          <strong>Quality filtering:</strong> decks whose total card value is under a
          dollar are dropped, because these are almost always incomplete or placeholder
          lists rather than genuine tournament entries.
        </li>
        <li>
          <strong>Card analysis:</strong> for each legend we sample its strongest recent
          lists — top-8 finishers — and aggregate the cards they run into inclusion rates
          and average copy counts, so you can see which cards are staples and which are
          flexible choices.
        </li>
        <li>
          <strong>Meaningful thresholds:</strong> a legend must have at least ten tracked
          decks before we rank it by 1st-place rate, which filters out the noise of a
          single lucky result.
        </li>
      </ul>
      <p>
        For a deeper walk-through of the pipeline and how to read the numbers responsibly,
        see our <strong>Guides</strong> section.
      </p>

      <h2>Glossary of terms</h2>
      <dl className="about-glossary">
        <dt>Legend</dt>
        <dd>
          The central card that defines a Riftbound deck&apos;s identity. We group and
          analyse decks by their legend.
        </dd>
        <dt>Placement / standing</dt>
        <dd>
          Where a deck finished at its tournament. Placement is our proxy for success — we
          do not have access to individual game results.
        </dd>
        <dt>1st-place rate</dt>
        <dd>
          The share of a legend&apos;s tracked decks that finished first. This is a
          placement statistic, not a head-to-head win rate between two decks.
        </dd>
        <dt>Popularity / meta share</dt>
        <dd>
          How often a legend appears across all tracked decks. High popularity tells you
          what the field is bringing, which is what you must prepare to beat.
        </dd>
        <dt>Inclusion rate</dt>
        <dd>
          On a legend&apos;s card-analysis page, the share of sampled decks that run a
          given card. A high inclusion rate means the card is effectively a staple.
        </dd>
        <dt>Average copies</dt>
        <dd>
          The typical number of copies of a card that decks running it choose to play.
        </dd>
      </dl>

      <h2>Contact</h2>
      <p>
        Questions, corrections, or suggestions? Reach us at{' '}
        <a href="mailto:contact@bestriftdecks.xyz">contact@bestriftdecks.xyz</a>.
      </p>
    </div>
  )
}
