/**
 * Focused /sales responsive smoke coverage.
 *
 *   BASE_URL=http://127.0.0.1:1616 CHROME_PATH=/path/to/chrome \
 *     npm run qa:sales-responsive
 */
import { access, mkdir } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:1616'
const EVIDENCE_DIR = process.env.EVIDENCE_DIR
const HEADFUL = process.argv.includes('--headful')

const ACCOUNTS = [
  { role: 'owner', id: 'usr_001' },
  { role: 'admin', id: 'usr_002' },
  { role: 'manager', id: 'usr_004' },
  { role: 'agent', id: 'usr_012' },
]

const VIEWPORTS = [
  { name: '320', width: 320, height: 700 },
  { name: '360', width: 360, height: 800 },
  { name: '390', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
]

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next documented local browser path.
    }
  }
  throw new Error('Chrome not found. Set CHROME_PATH to a Chromium-compatible executable.')
}

let failures = 0
function check(ok, label, detail = '') {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function clickNamedButton(page, pattern) {
  const clicked = await page.$$eval('button', (buttons, source) => {
    const matcher = new RegExp(source, 'i')
    const button = buttons.find((candidate) => {
      const name = candidate.getAttribute('aria-label') || candidate.textContent || ''
      const style = window.getComputedStyle(candidate)
      return matcher.test(name.trim()) && style.display !== 'none' && style.visibility !== 'hidden'
    })
    if (!(button instanceof HTMLButtonElement)) return false
    button.click()
    return true
  }, pattern.source)
  if (clicked) await wait(180)
  return clicked
}

async function signIn(page, userId) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => {
    localStorage.setItem(
      'shelter-session',
      JSON.stringify({ state: { currentUserId: id, activeLocationId: null }, version: 0 }),
    )
    localStorage.setItem('shelter-theme', 'light')
  }, userId)
}

const chromePath = await findChrome()
if (EVIDENCE_DIR) await mkdir(EVIDENCE_DIR, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: !HEADFUL,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  for (const account of ACCOUNTS) {
    for (const viewport of VIEWPORTS) {
      console.log(`\n${account.role} · ${viewport.name}`)
      const page = await browser.newPage()
      await page.setViewport({ width: viewport.width, height: viewport.height })
      if (account.role === 'owner' && viewport.width === 320) {
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
      }
      const errors = []
      page.on('pageerror', (error) => errors.push(String(error.message ?? error)))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })

      await signIn(page, account.id)
      await page.goto(`${BASE_URL}/sales`, { waitUntil: 'networkidle2', timeout: 30000 })
      await wait(450)

      const initial = await page.evaluate(() => ({
        body: document.body.innerText,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        visibleTables: [...document.querySelectorAll('table')].filter(
          (table) => table.getClientRects().length > 0,
        ).length,
        searchVisible: [...document.querySelectorAll('input')].some((input) => {
          const style = window.getComputedStyle(input)
          return /contract|buyer|lot|search/i.test(input.placeholder) && style.display !== 'none'
        }),
      }))

      check(/Sales|My Sales/.test(initial.body), 'sales route renders')
      check(initial.scrollWidth <= initial.clientWidth + 1, 'no page-level horizontal overflow', `${initial.scrollWidth}/${initial.clientWidth}`)
      check(initial.searchVisible, 'lookup remains immediately available')
      check(errors.length === 0, 'initial console clean', errors[0] ?? '')

      if (EVIDENCE_DIR && ['320', '390', '768', '1440'].includes(viewport.name)) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `${account.role}-${viewport.name}.png`),
          fullPage: true,
        })
      }

      if (viewport.width < 1024) {
        check(initial.visibleTables === 0, 'mobile uses responsive records', `${initial.visibleTables} visible tables`)
        const openedNav = await clickNamedButton(page, /open navigation|menu/)
        check(openedNav, 'mobile navigation opens')
        if (openedNav) {
          check(await page.$('[role="dialog"]') !== null, 'mobile navigation uses a focus-managed surface')
          if (account.role === 'owner' && viewport.width === 320) {
            const routeLink = await page.$('[role="dialog"] a[href="/dashboard"]')
            check(Boolean(routeLink), 'shared mobile navigation exposes permitted routes')
            if (routeLink) {
              await routeLink.click()
              await wait(450)
              check(
                await page.evaluate(() => window.location.pathname === '/dashboard'),
                'mobile navigation closes by route selection',
              )
              await page.goto(`${BASE_URL}/sales`, { waitUntil: 'networkidle2', timeout: 30000 })
              await wait(450)
            }
          } else {
            await page.keyboard.press('Escape')
            await wait(450)
          }
        }
      } else if (viewport.width >= 1024) {
        check(initial.visibleTables > 0, 'desktop table density remains available')
        if (account.role === 'owner' && viewport.width === 1024) {
          const sortable = await page.$('th[aria-sort] button')
          check(Boolean(sortable), 'desktop sortable header is a semantic button')
          if (sortable) {
            const before = await sortable.evaluate((button) =>
              button.closest('th')?.getAttribute('aria-sort'),
            )
            await sortable.focus()
            await page.keyboard.press('Enter')
            await wait(250)
            const after = await sortable.evaluate((button) =>
              button.closest('th')?.getAttribute('aria-sort'),
            )
            check(before !== after, 'desktop sort works by keyboard and updates aria-sort', `${before} → ${after}`)
          }
        }
      }

      for (const tabName of ['Payments', 'Receivables', 'Clients', 'Contracts']) {
        const clicked = await clickNamedButton(page, new RegExp(`^${tabName}$`))
        check(clicked, `${tabName} tab is reachable`)
        if (!clicked) continue
        const dims = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }))
        check(dims.scrollWidth <= dims.clientWidth + 1, `${tabName} has no page overflow`, `${dims.scrollWidth}/${dims.clientWidth}`)
      }

      if (viewport.width < 1024) {
        const filtersOpened = await clickNamedButton(page, /filters/)
        check(filtersOpened, 'secondary filters open on mobile')
        if (filtersOpened) {
          await page.keyboard.press('Escape')
          await wait(450)
        }
      }

      if (account.role === 'agent' && viewport.width === 320) {
        const holdOpened = await clickNamedButton(page, /request hold/)
        check(holdOpened, 'agent hold workflow opens at 320px')
        if (holdOpened) {
          await page.keyboard.press('Escape')
          await wait(450)
        }
      }

      check(errors.length === 0, 'interaction console clean', errors[0] ?? '')
      await page.close()
    }
  }
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}\n`)
process.exit(failures === 0 ? 0 : 1)
