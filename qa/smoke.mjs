/**
 * Cross-role smoke test. Drives the real app in headless Chrome and asserts
 * the things the client will actually click through.
 *
 *   node qa/smoke.mjs            # all roles, all routes
 *   node qa/smoke.mjs --headful  # watch it run
 */
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = 'http://localhost:5173'
const HEADFUL = process.argv.includes('--headful')

const ROUTES = [
  '/map',
  '/dashboard',
  '/sales',
  '/burials',
  '/agents',
  '/agents/leaderboard',
  '/agents/payouts',
  '/approvals',
  '/pricing',
  '/map-editor',
  '/audit',
]

// Demo accounts, resolved from the seed's deterministic ids.
const ACCOUNTS = [
  { role: 'owner', id: 'usr_001', name: 'Wendy M. Rabina' },
  { role: 'admin', id: 'usr_002', name: 'Judith C. Montero' },
  { role: 'manager', id: 'usr_004', name: 'Josefina R. Bacaltos' },
  { role: 'manager-townsite', id: 'usr_005', name: 'Eduardo P. Gempesaw' },
  // The first associate — the rank-and-file view the walkthrough contrasts
  // against a manager's, not a distributor.
  { role: 'agent', id: 'usr_012', name: 'Grace A. Delos Reyes' },
]

const results = []
let failures = 0

function log(ok, msg, detail) {
  const mark = ok ? '  ok ' : '  FAIL'
  console.log(`${mark}  ${msg}${detail ? `  — ${detail}` : ''}`)
  if (!ok) failures++
  results.push({ ok, msg, detail })
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !HEADFUL,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  for (const acct of ACCOUNTS) {
    console.log(`\n── ${acct.role} · ${acct.name} ──────────────────────────`)
    const page = await browser.newPage()

    const errors = []
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    page.on('pageerror', (e) => errors.push(String(e.message ?? e)))

    // Seed the session directly — the login form is covered separately.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await page.evaluate((id) => {
      localStorage.setItem(
        'shelter-session',
        JSON.stringify({ state: { currentUserId: id, activeLocationId: null }, version: 0 }),
      )
      localStorage.setItem('shelter-theme', 'light')
    }, acct.id)

    for (const route of ROUTES) {
      errors.length = 0
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2', timeout: 30000 })
      await new Promise((r) => setTimeout(r, 700))

      const state = await page.evaluate(() => {
        const body = document.body.innerText || ''
        return {
          text: body.slice(0, 400),
          forbidden: body.includes("don't have access"),
          crashed: body.includes('Something went wrong'),
          empty: document.body.innerText.trim().length < 40,
          nativeControls: {
            select: document.querySelectorAll('select').length,
            checkbox: document.querySelectorAll('input[type=checkbox]').length,
            radio: document.querySelectorAll('input[type=radio]').length,
            date: document.querySelectorAll('input[type=date]').length,
            progress: document.querySelectorAll('progress').length,
          },
        }
      })

      const label = `${route}`.padEnd(22)
      if (state.crashed) {
        log(false, `${label} CRASHED`, state.text.slice(0, 120))
      } else if (state.empty) {
        log(false, `${label} rendered empty`)
      } else {
        const kind = state.forbidden ? '403 (by design?)' : 'rendered'
        const loopErr = errors.find((e) => /Maximum update depth|getSnapshot/.test(e))
        if (loopErr) log(false, `${label} render loop`, loopErr.slice(0, 100))
        else if (errors.length) log(false, `${label} ${kind}, console errors`, errors[0].slice(0, 130))
        else log(true, `${label} ${kind}`)
      }

      const nc = state.nativeControls
      const nativeTotal = nc.select + nc.checkbox + nc.radio + nc.date + nc.progress
      if (nativeTotal > 0) {
        log(false, `${label} native controls`, JSON.stringify(nc))
      }
    }

    await page.close()
  }

  // ── login screen ────────────────────────────────────────────────
  console.log('\n── login screen ──────────────────────────────────')
  const page = await browser.newPage()
  const loginErrors = []
  page.on('pageerror', (e) => loginErrors.push(String(e.message ?? e)))
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 600))

  const login = await page.evaluate(() => ({
    text: document.body.innerText,
    radios: document.querySelectorAll('[role=radio]').length,
  }))
  log(login.text.includes('Welcome back'), 'login renders')
  log(login.radios >= 5, 'demo account picker', `${login.radios} options`)
  log(
    login.text.includes('Grace A. Delos Reyes'),
    'demo agent is an associate',
    login.text.match(/Grace A\. Delos Reyes/) ? 'Grace A. Delos Reyes' : 'NOT FOUND',
  )
  log(loginErrors.length === 0, 'login console clean', loginErrors[0]?.slice(0, 100))
  await page.close()
} finally {
  await browser.close()
}

console.log(
  `\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} — ${results.length} checks\n`,
)
process.exit(failures === 0 ? 0 : 1)
