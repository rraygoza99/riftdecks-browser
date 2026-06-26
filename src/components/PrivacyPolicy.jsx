import './PrivacyPolicy.css'

export default function PrivacyPolicy({ onBack }) {
  return (
    <div className="legal-page">
      <button type="button" className="legal-back" onClick={onBack}>
        ← Back to decks
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
        This site uses <strong>Google AdSense</strong> to display ads. Third-party
        vendors, including Google, use cookies to serve ads based on your prior visits
        to this and other websites.
      </p>
      <ul>
        <li>
          Google’s use of advertising cookies enables it and its partners to serve ads
          to you based on your visit to this site and/or other sites on the Internet.
        </li>
        <li>
          You may opt out of personalised advertising by visiting{' '}
          <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
            Google Ads Settings
          </a>
          .
        </li>
        <li>
          For more information about how Google uses data, see{' '}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noopener noreferrer"
          >
            How Google uses information from sites or apps that use our services
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
