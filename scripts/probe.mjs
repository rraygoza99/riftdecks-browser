import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
chromium.use(StealthPlugin())

const TOURNAMENT_URL = 'https://riftdecks.com/riftbound-tournaments/xixi-birthday-bash-tournament-decks-11137'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  await page.goto('https://riftdecks.com', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.title.toLowerCase().includes('moment'), { timeout: 20000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 1000))

  await page.goto(TOURNAMENT_URL, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !document.title.toLowerCase().includes('moment'), { timeout: 20000 }).catch(() => {})
  await new Promise(r => setTimeout(r, 1000))

  const info = await page.evaluate(() => {
    // Find the "showing N record(s) out of N total" element and its tag
    const allEls = [...document.querySelectorAll('*')]
    const recordEl = allEls.find(e => /showing\s+\d+\s+record/.test(e.textContent) && e.children.length === 0)
    const recordText = recordEl ? recordEl.textContent.trim() : null
    const recordTag = recordEl ? recordEl.tagName + (recordEl.className ? '.' + recordEl.className.trim().replace(/\s+/g, '.') : '') : null
    const m = recordText && recordText.match(/out of (\d+) total/i)
    const totalPlayers = m ? parseInt(m[1], 10) : null
    return { recordText, recordTag, totalPlayers }
  })

  console.log(JSON.stringify(info, null, 2))

  await browser.close()
})()
