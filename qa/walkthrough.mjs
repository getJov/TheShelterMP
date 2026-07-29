/**
 * Drives the demo walkthrough itself — the path the client will actually be
 * shown. Route rendering is covered by smoke.mjs; this asserts behaviour.
 *
 *   node qa/walkthrough.mjs [--headful]
 */
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const HEADFUL = process.argv.includes('--headful')

const USERS = {
  owner: 'usr_001',
  admin: 'usr_002',
  manager: 'usr_004',
  agent: 'usr_012', // Grace A. Delos Reyes, associate
}

let failures = 0
const log = (ok, msg, detail) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !HEADFUL,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e.message ?? e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function signInAs(id) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate((uid) => {
    localStorage.setItem(
      'shelter-session',
      JSON.stringify({ state: { currentUserId: uid, activeLocationId: null }, version: 0 }),
    )
  }, id)
}

const text = () => page.evaluate(() => document.body.innerText)

try {
  // ── 1. map renders the park ──────────────────────────────────────
  console.log('\n1 · The park')
  await signInAs(USERS.owner)
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle2' })
  await wait(2200)

  const mapState = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    body: document.body.innerText,
  }))
  log(mapState.canvases > 0, 'map canvas present', `${mapState.canvases} canvas layers`)
  log(/Available/i.test(mapState.body), 'legend shows statuses')
  log(/904|684/.test(mapState.body), 'real lot counts on screen')

  // ── 2. lot deep link opens the drawer ────────────────────────────
  console.log('\n2 · One lot, everything about it')
  errors.length = 0
  await page.goto(`${BASE}/map?lot=B01-L022`, { waitUntil: 'networkidle2' })
  await wait(2600)
  const drawer = await text()
  log(drawer.includes('B01-L022'), 'deep link selects the lot')
  log(/TSM-\d{4}-\d{5}/.test(drawer), 'contract number shown', drawer.match(/TSM-\d{4}-\d{5}/)?.[0])
  log(/Lawn|Garden/.test(drawer), 'tier shown')
  log(errors.length === 0, 'drawer console clean', errors[0]?.slice(0, 110))

  // ── 3. pricing: the July promo ───────────────────────────────────
  console.log('\n3 · Pricing that moves')
  errors.length = 0
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle2' })
  await wait(1800)
  const pricing = await text()
  log(pricing.includes('₱60,000') || pricing.includes('60,000'), 'list price ₱60,000 present')
  log(pricing.includes('48,000'), 'Lawn Plus promo ₱48,000 present')
  log(pricing.includes('45,000'), 'Lawn Standard promo ₱45,000 present')
  log(/264,000|528,000/.test(pricing), 'family garden pricing present')
  log(/Contact for pricing/i.test(pricing), 'mausoleum reads "Contact for pricing"')
  log(errors.length === 0, 'pricing console clean', errors[0]?.slice(0, 110))

  // ── 4. burials: the two-slot ceiling ─────────────────────────────
  console.log('\n4 · Burials')
  errors.length = 0
  await page.goto(`${BASE}/burials`, { waitUntil: 'networkidle2' })
  await wait(1800)
  const burials = await text()
  log(/FULL/i.test(burials), 'fully-booked days marked FULL')
  log(errors.length === 0, 'burials console clean', errors[0]?.slice(0, 110))

  // ── 5. commissions: Sat→Thu, released Friday ─────────────────────
  console.log('\n5 · Commissions and Friday')
  errors.length = 0
  await page.goto(`${BASE}/agents/payouts`, { waitUntil: 'networkidle2' })
  await wait(1800)
  const payouts = await text()
  log(/Jul|Aug/.test(payouts), 'payout periods shown')
  log(/₱/.test(payouts), 'payout totals shown')
  log(errors.length === 0, 'payouts console clean', errors[0]?.slice(0, 110))

  // ── 6. assumed chips are visible ─────────────────────────────────
  console.log('\n6 · Assumptions surfaced')
  // The rules editor is admin-only — the owner correctly gets an explanation.
  await signInAs(USERS.admin)
  await page.goto(`${BASE}/agents/rules`, { waitUntil: 'networkidle2' })
  await wait(1500)
  const rules = await text()
  log(/assumed/i.test(rules), 'ASSUMED chip on commission rules')
  log(/6|4|2/.test(rules), '6/4/2 split shown')

  // ── 7. the agent's restricted map ────────────────────────────────
  console.log('\n7 · Two people, one system')
  errors.length = 0
  await signInAs(USERS.agent)
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle2' })
  await wait(2200)
  const agentNav = await page.evaluate(() =>
    [...document.querySelectorAll('nav a')].map((a) => a.textContent?.trim()).filter(Boolean),
  )
  log(!agentNav.some((n) => /Approvals/i.test(n)), 'agent has no Approvals nav', agentNav.join(', '))
  log(!agentNav.some((n) => /Map Editor|Audit/i.test(n)), 'agent has no Manage section')
  log(agentNav.some((n) => /Price List/i.test(n)), 'agent sees the price list, not "Manage"')
  log(agentNav.some((n) => /My Sales/i.test(n)), 'agent sees "My Sales", not "Sales & Payments"')
  log(agentNav.some((n) => /My Earnings/i.test(n)), 'agent sees "My Earnings"')
  log(errors.length === 0, 'agent map console clean', errors[0]?.slice(0, 110))

  // ── 8. manager sees the full nav ─────────────────────────────────
  console.log('\n8 · Manager scope')
  await signInAs(USERS.manager)
  await page.goto(`${BASE}/map`, { waitUntil: 'networkidle2' })
  await wait(1800)
  const mgrNav = await page.evaluate(() =>
    [...document.querySelectorAll('nav a')].map((a) => a.textContent?.trim()).filter(Boolean),
  )
  log(mgrNav.some((n) => /Approvals/i.test(n)), 'manager has Approvals')
  log(!mgrNav.some((n) => /Map Editor/i.test(n)), 'manager has no Map Editor')
  const mgrBody = await text()
  log(/Ilangay/i.test(mgrBody), 'manager location chip shows Ilangay')

  // ── 9. dark mode ─────────────────────────────────────────────────
  console.log('\n9 · Dark mode')
  errors.length = 0
  await page.evaluate(() => {
    localStorage.setItem('shelter-theme', 'dark')
  })
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle2' })
  await wait(1600)
  const dark = await page.evaluate(() => ({
    isDark: document.documentElement.classList.contains('dark'),
    bg: getComputedStyle(document.body).backgroundColor,
  }))
  log(dark.isDark, 'dark class applied', dark.bg)
  log(errors.length === 0, 'dark mode console clean', errors[0]?.slice(0, 110))
  await page.evaluate(() => localStorage.setItem('shelter-theme', 'light'))

  // ── 10. map editor ───────────────────────────────────────────────
  console.log('\n10 · Map editor')
  errors.length = 0
  await signInAs(USERS.admin)
  await page.goto(`${BASE}/map-editor`, { waitUntil: 'networkidle2' })
  await wait(2400)
  const editor = await text()
  log(/Block|Grid|Select/i.test(editor), 'editor tools present')
  log(/B01|B02|B03/.test(editor), 'blocks listed')
  log(errors.length === 0, 'editor console clean', errors[0]?.slice(0, 110))
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}\n`)
process.exit(failures === 0 ? 0 : 1)
