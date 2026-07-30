import assert from 'node:assert/strict'
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:1616'
const CHROME =
  process.env.CHROME_PATH ??
  '/home/jovanie_getalla/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(String(error.message ?? error)))

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    localStorage.setItem(
      'shelter-session',
      JSON.stringify({ state: { currentUserId: 'usr_002', activeLocationId: null }, version: 0 }),
    )
    localStorage.setItem('shelter-theme', 'light')
  })

  await page.goto(`${BASE}/map-editor`, { waitUntil: 'networkidle2', timeout: 30000 })
  await new Promise((resolve) => setTimeout(resolve, 1600))

  const initial = await page.evaluate(() => ({
    text: document.body.innerText,
    workflows: [...document.querySelectorAll('[aria-label]')]
      .map((node) => node.getAttribute('aria-label'))
      .filter(Boolean),
    canvases: document.querySelectorAll('canvas').length,
  }))

  for (const label of ['Base Map', 'Site Plan', 'Blocks', 'Lots', 'Tiers', 'Review']) {
    assert.ok(initial.workflows.includes(label), `missing workflow ${label}`)
  }
  assert.ok(initial.canvases > 0, 'map editor canvas did not render')
  assert.match(initial.text, /Base Map/)
  assert.match(initial.text, /Satellite/)
  assert.match(initial.text, /Reset north and fit layout/)

  await clickByLabel('Site Plan')
  const sitePlanText = await bodyText()
  assert.match(sitePlanText, /Drop a site plan here/)
  assert.match(sitePlanText, /Choose a file/)
  assert.match(sitePlanText, /Compare/)
  if (/Overlays ·/.test(sitePlanText)) {
    assert.match(sitePlanText, /Opacity/i)
    assert.match(sitePlanText, /Lock position/i)
  }

  await clickByLabel('Blocks')
  assert.match(await bodyText(), /Block Actions/i)
  assert.match(await bodyText(), /Draw block/)
  assert.match(await bodyText(), /Generate lots/)

  await clickByLabel('Lots')
  assert.match(await bodyText(), /Lot Actions/i)
  assert.match(await bodyText(), /Select tools/)
  assert.match(await bodyText(), /Edit tiers/)

  await clickByLabel('Tiers')
  assert.match(await bodyText(), /Tier Paint/i)
  assert.match(await bodyText(), /Sync tier sizes/)

  await clickByLabel('Review')
  assert.match(await bodyText(), /Review/)
  assert.match(await bodyText(), /No geometry blockers|Publish is blocked/)

  assert.deepEqual(errors, [])
  console.log('map-editor-layered-smoke-ok')
} finally {
  await browser.close()
}

async function clickByLabel(label) {
  await page.evaluate((targetLabel) => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (node) => node.getAttribute('aria-label') === targetLabel,
    )
    if (!(el instanceof HTMLElement)) throw new Error(`No element labelled ${targetLabel}`)
    el.click()
  }, label)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

async function bodyText() {
  return page.evaluate(() => document.body.innerText)
}
