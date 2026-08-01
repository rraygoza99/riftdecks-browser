import './PrivacyPolicy.css'

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" style={{marginRight: '6px', verticalAlign: '-2px'}}>
          <path d="M8.354 1.146a.5.5 0 0 0-.708 0l-6 6A.5.5 0 0 0 1.5 7.5v7a.5.5 0 0 0 .5.5h4.5a.5.5 0 0 0 .5-.5v-4h2v4a.5.5 0 0 0 .5.5H14a.5.5 0 0 0 .5-.5v-7a.5.5 0 0 0-.146-.354L13 5.793V2.5a.5.5 0 0 0-.5-.5h-1a.5.5 0 0 0-.5.5v1.293L8.354 1.146z"/>
        </svg>
        Home
      </button>

      <h1>Privacy Policy</h1>
      <p className="legal-updated">Last updated: June 26, 2026</p>

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
        RiftDecks Browser (“we”, “us”, or “the site”) is a free tool that displays
        publicly available Riftbound tournament deck data. This page explains what
        information is collected when you use{' '}
        <strong>bestriftdecks.xyz</strong> and how it is used.
      </p>

      <h2>Information we collect</h2>
      <p>
        We do not ask you to create an account and we do not collect personal
        information such as your name or email address. The only data stored by the
        site itself is your list of favourite decks, which is kept locally in your
        browser (via <code>localStorage</code>) and never sent to us.
      </p>

      <h2>Cookies and advertising</h2>
      <p>
        This site uses <strong>Adsterra</strong>, a third-party advertising network, to
        display ads. Adsterra and its partners may use cookies and similar technologies
        to serve and measure ads based on your prior visits to this and other websites.
      </p>
      <ul>
        <li>
          The use of advertising cookies enables Adsterra and its partners to serve ads
          to you based on your visit to this site and/or other sites on the Internet.
        </li>
        <li>
          For more information about how Adsterra handles data, see the{' '}
          <a href="https://adsterra.com/privacy-policy/" target="_blank" rel="noopener noreferrer">
            Adsterra Privacy Policy
          </a>
          .
        </li>
        <li>
          You can opt out of third-party vendor cookies for personalised advertising
          at{' '}
          <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
            aboutads.info/choices
          </a>
          .
        </li>
      </ul>

      <h2>Consent (EEA, UK, and Switzerland)</h2>
      <p>
        If you are visiting from the European Economic Area, the United Kingdom, or
        Switzerland, you will be shown a consent message before personalised ads are
        served. You can choose to consent, refuse, or manage your options at any time,
        and your choice is respected by our advertising partners.
      </p>

      <h2>Analytics</h2>
      <p>
        We may use aggregate, non-identifying traffic statistics to understand how the
        site is used. This data cannot be used to identify you personally.
      </p>

      <h2>Third-party data</h2>
      <p>
        Deck and tournament data shown on this site is sourced from{' '}
        <a href="https://riftdecks.com" target="_blank" rel="noopener noreferrer">
          riftdecks.com
        </a>
        . We are not affiliated with riftdecks.com or Riot Games.
      </p>

      <h2>Contact</h2>
      <p>
        If you have any questions about this Privacy Policy, you can reach us at{' '}
        <a href="mailto:contact@bestriftdecks.xyz">contact@bestriftdecks.xyz</a>.
      </p>
    </div>
  )
}
