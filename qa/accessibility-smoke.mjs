/**
 * Focused accessibility smoke coverage for the readability foundation.
 *
 *   BASE_URL=http://127.0.0.1:1616 npm run qa:accessibility
 *   BROWSER_PATH=/path/to/chromium npm run qa:accessibility
 */
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:1616'
const HEADFUL = process.argv.includes('--headful')
const BROWSER_CANDIDATES = [
  process.env.BROWSER_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/home/jovanie_getalla/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
].filter(Boolean)
const executablePath = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))

if (!executablePath) {
  throw new Error('No compatible browser found. Set BROWSER_PATH to a Chromium executable.')
}

const OWNER_ID = 'usr_001'
const ADMIN_ID = 'usr_002'
const AGENT_ID = 'usr_012'
const ACCESSIBILITY_KEY = 'shelter-accessibility'
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
]
const registeredRoutes = [
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

let failures = 0
let checks = 0

function check(condition, message, detail = '') {
  checks++
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${message}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

function preferences(overrides = {}) {
  return {
    textSize: 'standard',
    contrast: 'standard',
    motion: 'system',
    mapPresentation: 'map',
    ...overrides,
  }
}

async function seed(page, userId, values = preferences()) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ id, prefs, key }) => {
      localStorage.clear()
      if (id) {
        localStorage.setItem(
          'shelter-session',
          JSON.stringify({ state: { currentUserId: id, activeLocationId: null }, version: 0 }),
        )
      }
      localStorage.setItem(key, JSON.stringify({ state: prefs, version: 1 }))
      localStorage.setItem('shelter-theme', 'light')
    },
    { id: userId, prefs: values, key: ACCESSIBILITY_KEY },
  )
}

async function open(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await wait(350)
}

async function clickVisibleButton(page, label) {
  const clicked = await page.evaluate((expected) => {
    const button = [...document.querySelectorAll('button')].find((candidate) => {
      const rect = candidate.getBoundingClientRect()
      return candidate.textContent?.trim() === expected && rect.width > 0 && rect.height > 0
    })
    button?.click()
    return Boolean(button)
  }, label)
  if (!clicked) throw new Error(`Visible button not found: ${label}`)
  await wait(150)
}

async function pageHealth(page) {
  return page.evaluate(() => ({
    crashed: document.body.innerText.includes('Something went wrong'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    main: Boolean(document.querySelector('#main-content')),
  }))
}

const browser = await puppeteer.launch({
  executablePath,
  headless: !HEADFUL,
  defaultViewport: viewports[0],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error.message ?? error)))

  console.log('\nTypography and pre-authentication settings')
  await seed(page, null)
  await open(page, '/login')
  const preAuth = await page.evaluate(() => ({
    settings: [...document.querySelectorAll('button')].some((button) =>
      /display settings/i.test(button.textContent ?? button.getAttribute('aria-label') ?? ''),
    ),
    body: Number.parseFloat(getComputedStyle(document.querySelector('.text-body')).fontSize),
    caption: Number.parseFloat(getComputedStyle(document.querySelector('.text-caption')).fontSize),
  }))
  check(preAuth.settings, 'Display Settings is available before sign-in')
  check(preAuth.body === 16 && preAuth.caption === 14, 'Standard semantic type roles resolve exactly', JSON.stringify(preAuth))

  for (const [textSize, expectedBody] of [['large', 18], ['extra-large', 20]]) {
    await seed(page, null, preferences({ textSize }))
    await open(page, '/login')
    const result = await page.evaluate(() => ({
      attr: document.documentElement.dataset.textSize,
      body: Number.parseFloat(getComputedStyle(document.querySelector('.text-body')).fontSize),
      control: Number.parseFloat(getComputedStyle(document.querySelector('button')).fontSize),
    }))
    check(result.attr === textSize, `${textSize} applies before React renders`, result.attr)
    check(result.body === expectedBody && result.control === expectedBody, `${textSize} scales body and controls exactly`, JSON.stringify(result))
  }

  console.log('\nRepresentative form semantics and errors')
  await seed(page, null)
  await open(page, '/login')
  await clickVisibleButton(page, 'Sign in')
  const loginError = await page.evaluate(() => ({
    alert: document.querySelector('[role=alert]')?.textContent?.trim(),
    emailInvalid: document.querySelector('#email')?.getAttribute('aria-invalid'),
    passwordInvalid: document.querySelector('#password')?.getAttribute('aria-invalid'),
    describedBy: document.querySelector('#password')?.getAttribute('aria-describedby'),
  }))
  check(
    Boolean(loginError.alert) && loginError.emailInvalid === 'true' && loginError.passwordInvalid === 'true' && loginError.describedBy === 'login-error',
    'Login failure is announced and associated with both invalid fields',
    JSON.stringify(loginError),
  )

  await seed(page, ADMIN_ID)
  await open(page, '/sales')
  await clickVisibleButton(page, 'Request hold')
  const salesForm = await page.evaluate(() => ({
    dialog: document.querySelector('[role=dialog]')?.textContent?.includes('Request a hold'),
    requiredComboboxes: document.querySelectorAll('[role=combobox][aria-required=true][aria-describedby]').length,
    submitDisabled: [...document.querySelectorAll('button')].some(
      (button) => button.textContent?.trim() === 'Request hold' && button.disabled,
    ),
  }))
  check(
    salesForm.dialog && salesForm.requiredComboboxes > 0 && salesForm.submitDisabled,
    'Sales hold form exposes required guidance and blocks incomplete submission',
    JSON.stringify(salesForm),
  )
  await clickVisibleButton(page, 'Cancel')

  await seed(page, ADMIN_ID)
  await open(page, '/burials')
  await clickVisibleButton(page, 'Schedule burial')
  await clickVisibleButton(page, 'Next')
  const burialError = await page.evaluate(() => ({
    dialog: document.querySelector('[role=dialog]')?.textContent?.includes('Schedule a burial'),
    alert: document.querySelector('#schedule-interment-error')?.textContent?.trim(),
    nextDescription: [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Next')
      ?.getAttribute('aria-describedby'),
  }))
  check(
    burialError.dialog && burialError.alert?.includes('Choose a lot') && burialError.nextDescription === 'schedule-interment-error',
    'Burial scheduling announces the blocked first step and associates the error',
    JSON.stringify(burialError),
  )

  console.log('\nPreference persistence and reset boundary')
  const persistent = preferences({
    textSize: 'extra-large',
    contrast: 'enhanced',
    motion: 'reduced',
    mapPresentation: 'list',
  })
  await seed(page, OWNER_ID, persistent)
  await open(page, '/?demo=1')
  const persisted = await page.evaluate((key) => ({
    stored: JSON.parse(localStorage.getItem(key) ?? '{}').state,
    attrs: { ...document.documentElement.dataset },
    session: localStorage.getItem('shelter-session'),
  }), ACCESSIBILITY_KEY)
  check(persisted.session === null, 'Demo reset clears the session')
  check(
    persisted.stored?.textSize === 'extra-large' && persisted.stored?.mapPresentation === 'list',
    'Demo reset preserves accessibility preferences',
  )
  check(
    persisted.attrs.textSize === 'extra-large' && persisted.attrs.contrast === 'enhanced' && persisted.attrs.motion === 'reduced',
    'Stored root attributes remain synchronized after reset',
  )

  console.log('\nMap/List parity, pagination, and drawer focus')
  await seed(page, OWNER_ID, preferences({ mapPresentation: 'list' }))
  await open(page, '/map')
  await page.waitForSelector('[data-lot-list-action="true"]')
  const listState = await page.evaluate(() => ({
    title: document.body.innerText.includes('Lot list'),
    actions: document.querySelectorAll('[data-lot-list-action="true"]').length,
    ownerFields: [...document.querySelectorAll('dt')].filter((node) => node.textContent === 'Owner').length,
    paymentFields: [...document.querySelectorAll('dt')].filter((node) => node.textContent === 'Payment health').length,
    canvases: document.querySelectorAll('canvas').length,
  }))
  check(listState.title && listState.canvases === 0, 'List presentation replaces the canvas')
  check(listState.actions > 0 && listState.actions <= 25, 'List renders no more than 25 explicit lot actions', `${listState.actions}`)
  check(listState.ownerFields + listState.paymentFields > 0, 'Authorized owner or payment context is present')

  await page.click('[data-lot-list-action="true"]')
  await wait(250)
  const drawerFocus = await page.evaluate(() => ({
    dialog: Boolean(document.querySelector('[role=dialog]')),
    inside: Boolean(document.activeElement?.closest('[role=dialog]')),
  }))
  check(drawerFocus.dialog && drawerFocus.inside, 'View lot opens the existing drawer and moves focus inside')
  await page.click('[aria-label="Close lot detail"]')
  await wait(450)
  check(
    await page.evaluate(() => document.activeElement?.getAttribute('data-lot-list-action') === 'true'),
    'Closing lot detail returns focus to the invoking list action',
  )

  await page.click('[aria-label="Map view"]')
  await wait(1200)
  const mapState = await page.evaluate((key) => ({
    canvas: document.querySelectorAll('canvas').length,
    stored: JSON.parse(localStorage.getItem(key) ?? '{}').state?.mapPresentation,
  }), ACCESSIBILITY_KEY)
  check(mapState.canvas > 0, 'Map presentation restores the canvas')
  check(mapState.stored === 'map', 'Map/List choice persists in accessibility preferences')

  await seed(page, AGENT_ID, preferences({ mapPresentation: 'list' }))
  await open(page, '/map')
  const restrictedStatuses = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article')]
    return cards.filter((card) => card.innerText.includes('Unavailable')).length
  })
  check(restrictedStatuses > 0, 'Restricted agent rows use the non-disclosing Unavailable status')

  console.log('\nKeyboard entry and responsive core workflows')
  await seed(page, OWNER_ID)
  await open(page, '/map')
  await page.evaluate(() => document.querySelector('a[href="#main-content"]')?.focus())
  check(
    await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Skip to main content'),
    'Skip link accepts keyboard focus',
  )
  await page.keyboard.press('Enter')
  check(await page.evaluate(() => document.activeElement?.id === 'main-content'), 'Skip link focuses main content')

  await page.click('a[href="/sales"]')
  await page.waitForFunction(() => window.location.pathname === '/sales')
  await page.waitForFunction(
    () => document.activeElement?.id === 'main-content' && document.title.startsWith('Sales'),
    { timeout: 3_000 },
  )
  check(
    await page.evaluate(() => document.activeElement?.id === 'main-content' && document.title.startsWith('Sales')),
    'Client-side route changes focus and announce the new main view',
  )

  console.log('\nRegistered route readability sweep')
  await page.setViewport({ width: 1366, height: 768 })
  for (const textSize of ['standard', 'large', 'extra-large']) {
    for (const route of registeredRoutes) {
      await seed(page, ADMIN_ID, preferences({ textSize, mapPresentation: 'list' }))
      await open(page, route)
      const state = await page.evaluate(() => ({
        crashed: document.body.innerText.includes('Something went wrong'),
        forbidden: document.body.innerText.includes("don't have access"),
        empty: document.body.innerText.trim().length < 40,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }))
      check(
        !state.crashed && !state.forbidden && !state.empty && state.overflow <= 1,
        `${textSize} ${route} remains readable and contained`,
        JSON.stringify(state),
      )
    }
  }

  for (const viewport of viewports) {
    await page.setViewport({ width: viewport.width, height: viewport.height })
    for (const route of ['/map', '/sales', '/burials']) {
      await seed(page, OWNER_ID, preferences({ textSize: 'extra-large', mapPresentation: route === '/map' ? 'list' : 'map' }))
      await open(page, route)
      const health = await pageHealth(page)
      check(!health.crashed, `${viewport.name} ${route} renders without the error boundary`)
      check(health.overflow <= 1, `${viewport.name} ${route} has no document horizontal overflow`, `${health.overflow}px`)
      const targets = await page.evaluate(() => {
        const visible = (element) => {
          const style = getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
        }
        const controls = [...document.querySelectorAll('[data-slot=button], [data-slot=input], [data-slot=select-trigger]')]
          .filter(visible)
          .filter((element) => !['xs', 'icon-xs'].includes(element.getAttribute('data-size') ?? ''))
        return controls.length ? Math.min(...controls.map((element) => element.getBoundingClientRect().height)) : 999
      })
      check(targets >= 40, `${viewport.name} ${route} shared controls meet the 40px floor`, `${targets.toFixed(1)}px`)
    }

    if (viewport.width < 1024) {
      check(
        await page.evaluate(() => {
          const button = document.querySelector('[aria-label="Open navigation"]')
          return button && getComputedStyle(button).display !== 'none'
        }),
        `${viewport.name} exposes sheet navigation`,
      )
    }
  }

  await page.setViewport({ width: 320, height: 800 })
  await seed(page, OWNER_ID, preferences({ textSize: 'extra-large', mapPresentation: 'list' }))
  await open(page, '/map')
  const narrow = await pageHealth(page)
  check(narrow.overflow <= 1, 'Effective 320 CSS pixel Map/List view reflows without page overflow', `${narrow.overflow}px`)
  check(pageErrors.length === 0, 'Focused run has no uncaught page errors', pageErrors[0] ?? '')
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} — ${checks} checks\n`)
process.exit(failures === 0 ? 0 : 1)
