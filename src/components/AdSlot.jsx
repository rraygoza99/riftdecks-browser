import { useEffect, useMemo, useRef } from 'react'
import './AdSlot.css'

// Adsterra "Native Banner" unit. Paste the full invoke.js URL from the snippet
// Adsterra gives you into a .env file at the project root:
//   VITE_ADSTERRA_NATIVE_SRC=https://plXXXXXXXX.effectivecpmnetwork.com/<key>/invoke.js
// The matching container id is `container-<key>`, derived automatically below.
const NATIVE_SRC = import.meta.env.VITE_ADSTERRA_NATIVE_SRC || ''

// Extract the 32-char hex key from the invoke.js URL to build the container id.
const NATIVE_KEY = (NATIVE_SRC.match(/\/([a-f0-9]{32})\/invoke\.js/i) || [])[1] || ''

// Adsterra fixed-size "Banner" unit (iframe format). Put its key in a .env file:
//   VITE_ADSTERRA_KEY_468x60=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
const BANNER_KEY_468x60 = import.meta.env.VITE_ADSTERRA_KEY_468x60 || ''

// Build a tiny self-contained HTML document for one fixed-size Adsterra banner.
// Rendering it inside an <iframe srcDoc> isolates Adsterra's global `atOptions`
// and document.write() calls so it can't clash with your SPA or other banners.
function bannerSrcDoc(adKey, width, height) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>
</head><body>
<script type="text/javascript">
  atOptions = { 'key':'${adKey}', 'format':'iframe', 'height':${height}, 'width':${width}, 'params':{} };
</script>
<script type="text/javascript" src="//www.highperformanceformat.com/${adKey}/invoke.js"></script>
</body></html>`
}

/**
 * Non-invasive Adsterra ad slot.
 *
 * Renders nothing until the matching key is configured, so the site stays
 * ad-free until you opt in. Reserves vertical space to avoid layout shift (CLS).
 *
 * @param {'native'|'banner'} variant - 'native' (responsive Native Banner) or
 *   'banner' (fixed-size iframe banner).
 */
export default function AdSlot({ variant = 'native', label = 'Advertisement' }) {
  if (variant === 'banner') return <BannerAd label={label} />
  return <NativeAd label={label} />
}

function NativeAd({ label }) {
  const containerRef = useRef(null)
  const injected = useRef(false)

  useEffect(() => {
    if (!NATIVE_SRC || !NATIVE_KEY || injected.current) return
    injected.current = true

    const script = document.createElement('script')
    script.async = true
    script.setAttribute('data-cfasync', 'false')
    script.src = NATIVE_SRC
    // Append after the container so Adsterra finds it by id.
    containerRef.current?.appendChild(script)

    return () => script.remove()
  }, [])

  if (!NATIVE_SRC || !NATIVE_KEY) return null

  return (
    <aside className="ad-slot" aria-label={label} ref={containerRef}>
      <span className="ad-slot-label">{label}</span>
      <div id={`container-${NATIVE_KEY}`} className="ad-slot-native" />
    </aside>
  )
}

function BannerAd({ label }) {
  const doc = useMemo(
    () => (BANNER_KEY_468x60 ? bannerSrcDoc(BANNER_KEY_468x60, 468, 60) : ''),
    []
  )

  if (!doc) return null

  return (
    <aside className="ad-slot" aria-label={label}>
      <span className="ad-slot-label">{label}</span>
      <iframe
        className="ad-slot-frame"
        title="Advertisement"
        srcDoc={doc}
        width={468}
        height={60}
        scrolling="no"
        frameBorder="0"
        loading="lazy"
      />
    </aside>
  )
}
