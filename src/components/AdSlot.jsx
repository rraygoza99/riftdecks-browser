import { useEffect, useRef } from 'react'
import './AdSlot.css'

// Google AdSense publisher id (ca-pub-XXXXXXXXXXXXXXXX). Put it in a .env file:
//   VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || ''

// Global kill-switch. Set VITE_ADS_ENABLED=false to serve the whole site
// ad-free (e.g. while an AdSense policy review is pending). Ads are on by
// default when a client id and slot are configured.
const ADS_ENABLED = import.meta.env.VITE_ADS_ENABLED !== 'false'

// Load the AdSense library once, lazily, using the configured publisher id.
let scriptRequested = false
function ensureAdSenseScript(client) {
  if (scriptRequested || typeof document === 'undefined') return
  scriptRequested = true
  const script = document.createElement('script')
  script.async = true
  script.crossOrigin = 'anonymous'
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`
  document.head.appendChild(script)
}

/**
 * Non-invasive Google AdSense slot.
 *
 * Renders nothing until both the publisher id (VITE_ADSENSE_CLIENT) and a `slot`
 * id are provided, so the site stays ad-free until you opt in. Reserves vertical
 * space to avoid layout shift (CLS).
 *
 * @param {string} slot - the ad unit (slot) id from your AdSense dashboard.
 * @param {string} [format] - AdSense ad format (default 'auto', responsive).
 */
export default function AdSlot({ slot, label = 'Advertisement', format = 'auto' }) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!ADS_ENABLED || !CLIENT || !slot || pushed.current) return
    pushed.current = true
    ensureAdSenseScript(CLIENT)
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // Script blocked or not ready yet — fail silently.
    }
  }, [slot])

  if (!ADS_ENABLED || !CLIENT || !slot) return null

  return (
    <aside className="ad-slot" aria-label={label}>
      <span className="ad-slot-label">{label}</span>
      <ins
        className="adsbygoogle ad-slot-ins"
        style={{ display: 'block' }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  )
}
