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
    canvases: document.querySelectorAll('canvas').length,
  }))

  for (const label of ['Map reference', 'Site plan', 'Blocks', 'Lots', 'Tiers', 'Review']) {
    assert.match(initial.text, new RegExp(label, 'i'), `missing setup step ${label}`)
  }
  assert.ok(initial.canvases > 0, 'map editor canvas did not render')
  assert.match(initial.text, /Layout setup/)
  assert.match(initial.text, /Work from top to bottom/)
  assert.doesNotMatch(initial.text, /BLOCKS · 3/)
  assert.match(initial.text, /Satellite/)
  assert.match(initial.text, /Reset north and fit layout/)
  assert.doesNotMatch(initial.text, /Drag the target/)

  await clickStep('Site plan')
  const sitePlanText = await bodyText()
  assert.match(sitePlanText, /Place the site plan/)
  assert.match(sitePlanText, /Drop a site plan here/)
  assert.match(sitePlanText, /Choose a file/)
  assert.match(sitePlanText, /Compare/)
  if (/Overlays ·/.test(sitePlanText)) {
    assert.match(sitePlanText, /Opacity/i)
    assert.match(sitePlanText, /Lock position/i)
  }

  await clickStep('Blocks')
  assert.match(await bodyText(), /Adjust one block at a time/)
  assert.match(await bodyText(), /Choose block/i)
  assert.match(await bodyText(), /Block Actions/i)
  assert.match(await bodyText(), /Draw block/)
  assert.match(await bodyText(), /Lot layout/)
  await clickByText('Lot layout')
  assert.match(await bodyText(), /Generate [\d,]+ new lots/)
  assert.match(await bodyText(), /Rearrange existing lots/)
  assert.match(await bodyText(), /keeps the existing records/i)

  await clickStep('Lots')
  assert.match(await bodyText(), /Arrange lots inside the block/)
  assert.match(await bodyText(), /Lot Actions/i)
  assert.match(await bodyText(), /Select by/)
  assert.match(await bodyText(), /Paint tiers/)

  await clickStep('Tiers')
  assert.match(await bodyText(), /Assign lot tiers/)
  assert.match(await bodyText(), /Tier Paint/i)
  assert.match(await bodyText(), /Match tier sizes/)

  await clickStep('Review')
  assert.match(await bodyText(), /Review/)
  assert.match(await bodyText(), /No geometry blockers|Publish is blocked/)
  assert.match(await bodyText(), /layout issue|staged change/i)

  await clickByText('Advanced tools')
  assert.match(await bodyText(), /LAYERS/)
  assert.match(await bodyText(), /BLOCKS · 3/)

  assert.deepEqual(errors, [])
  console.log('map-editor-guided-smoke-ok')
} finally {
  await browser.close()
}

async function clickByText(label) {
  await page.evaluate((targetLabel) => {
    const el = [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.toLowerCase().includes(targetLabel.toLowerCase()),
    )
    if (!(el instanceof HTMLElement)) throw new Error(`No button containing ${targetLabel}`)
    el.click()
  }, label)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

async function clickStep(label) {
  await page.evaluate((targetLabel) => {
    const el = [...document.querySelectorAll('[aria-label]')].find(
      (node) => node.getAttribute('aria-label') === `Open ${targetLabel} step`,
    )
    if (!(el instanceof HTMLElement)) throw new Error(`No step labelled ${targetLabel}`)
    el.click()
  }, label)
  await new Promise((resolve) => setTimeout(resolve, 350))
}

async function bodyText() {
  return page.evaluate(() => document.body.innerText)
}
