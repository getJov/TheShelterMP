/**
 * Standalone dashboard container-responsiveness and map-panel regression.
 *
 *   BASE_URL=http://127.0.0.1:1616 npm run qa:dashboard-responsive
 *   BROWSER_PATH=/path/to/chromium npm run qa:dashboard-responsive
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
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

const EVIDENCE_DIR = 'plans/08032026-standalone-dashboard-content-responsiveness/evidence'
const ACCESSIBILITY_KEY = 'shelter-accessibility'
const PANEL_KEY = 'shelter-panel'
const ROLE_CASES = {
  owner: {
    id: 'usr_001',
    cards: [
      'attention',
      'collections',
      'receivables',
      'inventory',
      'trust-fund',
      'leaderboard',
      'burials',
      'sales-activity',
      'payout',
    ],
    heroCount: 3,
    supportingCount: 5,
  },
  admin: {
    id: 'usr_002',
    cards: [
      'attention',
      'collections',
      'receivables',
      'inventory',
      'trust-fund',
      'leaderboard',
      'burials',
      'sales-activity',
      'payout',
    ],
    heroCount: 3,
    supportingCount: 5,
  },
  manager: {
    id: 'usr_004',
    cards: [
      'attention',
      'collections',
      'receivables',
      'inventory',
      'leaderboard',
      'burials',
      'sales-activity',
      'payout',
    ],
    heroCount: 3,
    supportingCount: 4,
  },
  agent: {
    id: 'usr_012',
    cards: ['inventory', 'leaderboard', 'sales-activity', 'payout'],
    heroCount: 1,
    supportingCount: 3,
  },
}

const OWNER_MATRIX = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 667, height: 375 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]
const ROLE_MATRIX = {
  admin: [320, 1440],
  manager: [320, 768, 1440],
  agent: [320, 768, 1440],
}
const BOUNDARY_WIDTHS = [479, 480, 639, 640, 767, 768, 895, 896, 959, 960, 1199, 1200, 1359, 1360, 1399, 1400, 1401]

let checks = 0
let failures = 0
const results = []

function check(condition, message, detail = '') {
  checks += 1
  const ok = Boolean(condition)
  if (!ok) failures += 1
  results.push({ ok, message, detail })
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${message}${detail ? ` — ${detail}` : ''}`)
}

const wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration))

function preferences(textSize = 'standard') {
  return {
    textSize,
    contrast: 'standard',
    motion: 'reduced',
    mapPresentation: 'map',
  }
}

async function seed(page, userId, textSize = 'standard') {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({ id, prefs, accessibilityKey, panelKey }) => {
      localStorage.clear()
      localStorage.setItem(
        'shelter-session',
        JSON.stringify({ state: { currentUserId: id, activeLocationId: null }, version: 0 }),
      )
      localStorage.setItem(accessibilityKey, JSON.stringify({ state: prefs, version: 1 }))
      localStorage.setItem(
        panelKey,
        JSON.stringify({
          state: {
            state: 'docked',
            lastDocked: 'docked',
            period: 'month',
            collapsedCards: [],
          },
          version: 0,
        }),
      )
      localStorage.setItem('shelter-theme', 'light')
    },
    { id: userId, prefs: preferences(textSize), accessibilityKey: ACCESSIBILITY_KEY, panelKey: PANEL_KEY },
  )
}

async function open(page, path) {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle2', timeout: 30_000 })
  await wait(300)
}

function expectedHeroColumns(width, count) {
  const available = Math.min(width, 1400)
  const capacity = available >= 960 ? 3 : available >= 640 ? 2 : 1
  return Math.min(capacity, count)
}

function expectedSupportingColumns(width, count) {
  const available = Math.min(width, 1400)
  const capacity = available >= 1360 ? 5 : available >= 1200 ? 4 : available >= 896 ? 3 : available >= 640 ? 2 : 1
  return Math.min(capacity, count)
}

async function openStandalone(page, role, width, height, textSize = 'standard') {
  const browserWidth = Math.max(820, width + 300)
  await page.setViewport({
    width: browserWidth,
    height,
    deviceScaleFactor: 1,
    hasTouch: width === 320 || width === 667,
    isMobile: false,
  })
  await seed(page, ROLE_CASES[role].id, textSize)
  await open(page, '/dashboard')
  const constrained = await page.evaluate((availableWidth) => {
    const surface = document.querySelector('[data-dashboard-surface="standalone"]')
    if (!(surface instanceof HTMLElement)) return false
    Object.assign(surface.style, {
      width: `${availableWidth}px`,
      minWidth: `${availableWidth}px`,
      maxWidth: `${availableWidth}px`,
      flex: '0 0 auto',
      alignSelf: 'flex-start',
    })
    return true
  }, width)
  if (!constrained) throw new Error('Standalone dashboard surface marker was not found.')
  await wait(120)
}

async function readStandalone(page) {
  return page.evaluate(() => {
    const rectOf = (element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }
    const columnsOf = (name) => {
      const grid = document.querySelector(`[data-dashboard-grid="${name}"]`)
      if (!(grid instanceof HTMLElement)) return 0
      return getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length
    }
    const surface = document.querySelector('[data-dashboard-surface="standalone"]')
    const content = document.querySelector('[data-dashboard-content]')
    const header = document.querySelector('[data-dashboard-header="standalone"]')
    const controls = document.querySelector('[data-dashboard-header-controls]')
    const titleBlock = header?.firstElementChild
    const firstGrid = document.querySelector('[data-dashboard-grid]')
    if (!(surface instanceof HTMLElement) || !(content instanceof HTMLElement) || !(header instanceof HTMLElement) || !(controls instanceof HTMLElement) || !(titleBlock instanceof HTMLElement) || !(firstGrid instanceof HTMLElement)) {
      throw new Error('Standalone dashboard measurement markers are incomplete.')
    }

    const surfaceRect = rectOf(surface)
    const contentRect = rectOf(content)
    const titleRect = rectOf(titleBlock)
    const controlsRect = rectOf(controls)
    const firstGridRect = rectOf(firstGrid)
    const periodButtons = [...document.querySelectorAll('[data-slot="toggle-group-item"]')]
      .filter((button) => button.closest('[aria-label="Reporting period"]'))
      .map((button) => ({
        text: button.innerText.trim(),
        name: button.getAttribute('aria-label'),
        state: button.getAttribute('data-state'),
        ...rectOf(button),
      }))
    const mapAction = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Open the map',
    )
    const cards = [...document.querySelectorAll('[data-dashboard-card]')].map((card) => {
      const rect = rectOf(card)
      return {
        id: card.getAttribute('data-dashboard-card'),
        overflow: card.scrollWidth - card.clientWidth,
        inContent: rect.left >= contentRect.left - 1 && rect.right <= contentRect.right + 1,
      }
    })
    const options = [...document.querySelectorAll('[data-dashboard-card-options]')].map((button) => ({
      opacity: getComputedStyle(button).opacity,
      ...rectOf(button),
    }))
    const actionableButtons = [...document.querySelectorAll('[data-dashboard-card] button:not(:disabled)')]
      .map((button) => ({
        name: button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '',
        ...rectOf(button),
      }))
    const narrowActions = actionableButtons.filter((button) => button.height < 20)
    const regularActions = actionableButtons.filter((button) => button.height >= 20)
    const values = [...document.querySelectorAll('[data-dashboard-card-value]')].map((value) => ({
      text: value.textContent?.trim(),
      cardOverflow: value.closest('[data-dashboard-card]').scrollWidth - value.closest('[data-dashboard-card]').clientWidth,
    }))
    const heroGrid = document.querySelector('[data-dashboard-grid="hero"]')
    const supportingGrid = document.querySelector('[data-dashboard-grid="supporting"]')

    return {
      surfaceRect,
      contentRect,
      titleRect,
      controlsRect,
      firstGridInset: firstGridRect.left - contentRect.left,
      surfaceOverflow: surface.scrollWidth - surface.clientWidth,
      contentOverflow: content.scrollWidth - content.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      cards,
      cardIds: cards.map((card) => card.id),
      options,
      periodButtons,
      mapAction: mapAction ? rectOf(mapAction) : null,
      heroColumns: columnsOf('hero'),
      supportingColumns: columnsOf('supporting'),
      heroGap: heroGrid ? Number.parseFloat(getComputedStyle(heroGrid).columnGap) : 0,
      supportingGap: supportingGrid ? Number.parseFloat(getComputedStyle(supportingGrid).columnGap) : 0,
      regularActionFloor: regularActions.length ? Math.min(...regularActions.map((button) => button.height)) : 999,
      narrowActionCount: narrowActions.length,
      hasNamedNarrowAlternatives: narrowActions.every((narrow) => {
        const narrowButton = [...document.querySelectorAll('[data-dashboard-card] button:not(:disabled)')]
          .find((button) => (button.getAttribute('aria-label') ?? button.textContent?.trim()) === narrow.name)
        const card = narrowButton?.closest('[data-dashboard-card]')
        const label = narrow.name.split(':')[0]?.trim().toLowerCase()
        return [...(card?.querySelectorAll('button:not(:disabled)') ?? [])].some((button) => {
          if (button === narrowButton || button.hasAttribute('data-dashboard-card-options')) return false
          return button.getBoundingClientRect().height >= 40 && button.textContent?.toLowerCase().includes(label)
        })
      }),
      values,
      textSize: document.documentElement.dataset.textSize,
      crashed: document.body.innerText.includes('Something went wrong'),
    }
  })
}

async function checkStandaloneCase(page, role, width, height, textSize = 'standard') {
  await openStandalone(page, role, width, height, textSize)
  const state = await readStandalone(page)
  const roleCase = ROLE_CASES[role]
  const label = `${role} ${width}px ${textSize}`
  const expectedContentWidth = Math.min(width, 1400)
  const expectedPadding = width >= 640 ? 24 : 16
  const expectedGap = width >= 640 ? 16 : 12

  check(!state.crashed, `${label} renders without the error boundary`)
  check(Math.abs(state.surfaceRect.width - width) <= 1, `${label} uses the requested available width`, `${state.surfaceRect.width}px`)
  check(Math.abs(state.contentRect.width - expectedContentWidth) <= 1, `${label} content width is fluid and capped`, `${state.contentRect.width}px`)
  check(
    Math.abs((state.surfaceRect.left + state.surfaceRect.right) / 2 - (state.contentRect.left + state.contentRect.right) / 2) <= 1,
    `${label} content is centered`,
  )
  check(state.surfaceOverflow <= 1 && state.contentOverflow <= 1, `${label} dashboard regions do not overflow`, JSON.stringify({ surface: state.surfaceOverflow, content: state.contentOverflow }))
  check(state.documentOverflow <= 1, `${label} does not introduce document horizontal overflow`, `${state.documentOverflow}px`)
  check(state.cardIds.join('|') === roleCase.cards.join('|'), `${label} card order and permissions match`, state.cardIds.join(', '))
  check(state.cards.every((card) => card.overflow <= 1 && card.inContent), `${label} every card stays inside content bounds`)
  check(Math.abs(state.firstGridInset - expectedPadding) <= 1, `${label} uses ${expectedPadding}px inline padding`, `${state.firstGridInset}px`)
  check(state.heroColumns === expectedHeroColumns(width, roleCase.heroCount), `${label} hero columns match`, `${state.heroColumns}`)
  check(state.supportingColumns === expectedSupportingColumns(width, roleCase.supportingCount), `${label} supporting columns match`, `${state.supportingColumns}`)
  check(state.heroGap === expectedGap && state.supportingGap === expectedGap, `${label} grid gaps match`, JSON.stringify({ hero: state.heroGap, supporting: state.supportingGap }))
  check(state.options.every((option) => option.opacity === '1' && option.width >= 40 && option.height >= 40), `${label} options are visible and at least 40px`)
  check(state.periodButtons.length === 4 && state.periodButtons.every((button) => button.height >= 40), `${label} period controls are complete and at least 40px`)
  check(state.periodButtons.map((button) => button.name).join('|') === 'Today|This week|This month|This quarter', `${label} period controls retain full accessible names`)
  check(state.periodButtons.filter((button) => button.state === 'on').map((button) => button.name).join('|') === 'This month', `${label} selected period remains This month`)
  check(state.mapAction?.height >= 44, `${label} Open the map is at least 44px`, `${state.mapAction?.height ?? 0}px`)
  check(state.regularActionFloor >= 40, `${label} regular card actions meet the 40px floor`, `${state.regularActionFloor}px`)
  check(state.hasNamedNarrowAlternatives, `${label} thin chart segments retain named larger alternatives`, `${state.narrowActionCount} thin segments`)
  check(state.values.every((value) => value.cardOverflow <= 1), `${label} card values remain contained`)
  check(state.textSize === textSize, `${label} applies the requested text preference`, state.textSize)

  const expectedLabels = width < 480
    ? ['Today', 'Week', 'Month', 'Quarter']
    : ['Today', 'This week', 'This month', 'This quarter']
  check(state.periodButtons.map((button) => button.text).join('|') === expectedLabels.join('|'), `${label} uses the expected visible period labels`, state.periodButtons.map((button) => button.text).join(', '))
  check(
    state.controlsRect.left >= state.titleRect.right ||
      state.controlsRect.right <= state.titleRect.left ||
      state.controlsRect.top >= state.titleRect.bottom - 1 ||
      state.controlsRect.bottom <= state.titleRect.top,
    `${label} title and controls do not overlap`,
  )
  if (width < 768) {
    check(state.controlsRect.top >= state.titleRect.bottom - 1, `${label} stacks header controls below the title`)
  }
  if (width < 480) {
    check(Math.abs((state.mapAction?.width ?? 0) - state.controlsRect.width) <= 1, `${label} map action spans the control row`)
  }

  return state
}

async function checkStandaloneMenu(page) {
  await openStandalone(page, 'owner', 320, 800)
  await page.click('[data-dashboard-card-options]')
  await page.waitForSelector('[data-slot="dropdown-menu-content"]')
  const menuText = await page.$eval('[data-slot="dropdown-menu-content"]', (menu) => menu.textContent ?? '')
  check(menuText.includes('Collapse'), 'standalone card menu keeps Collapse')
  check(!menuText.includes('Open full screen'), 'standalone card menu omits Open full screen')
  await page.keyboard.press('Escape')
}

async function checkPeriodInteraction(page) {
  await openStandalone(page, 'owner', 320, 800)
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-slot="toggle-group-item"]')]
      .find((candidate) => candidate.getAttribute('aria-label') === 'Today')
    button?.click()
  })
  await wait(100)
  check(
    await page.evaluate(() => document.querySelector('[data-slot="toggle-group-item"][aria-label="Today"]')?.getAttribute('data-state') === 'on'),
    '320px period control remains operable',
  )
}

async function checkKeyboardAndTouchAccess(page) {
  await openStandalone(page, 'owner', 320, 800)
  const initial = await page.evaluate(() => ({
    coarsePointer: matchMedia('(pointer: coarse)').matches,
    optionCount: document.querySelectorAll('[data-dashboard-card-options]').length,
    cardRowCount: [...document.querySelectorAll('[data-dashboard-card] button:not([data-dashboard-card-options])')]
      .filter((button) => button.getBoundingClientRect().height >= 40).length,
  }))
  check(initial.coarsePointer, '320px run uses a coarse pointer context')
  check(initial.optionCount === ROLE_CASES.owner.cards.length, '320px exposes every authorized card menu to touch and keyboard', `${initial.optionCount} menus`)
  check(initial.cardRowCount > 0, '320px keeps card row/detail actions in the keyboard surface', `${initial.cardRowCount} actions`)

  for (let index = 0; index < initial.optionCount; index += 1) {
    const focused = await page.evaluate((optionIndex) => {
      const option = document.querySelectorAll('[data-dashboard-card-options]')[optionIndex]
      if (!(option instanceof HTMLButtonElement)) return false
      option.focus()
      return document.activeElement === option
    }, index)
    check(focused, `card menu ${index + 1} receives keyboard focus`)
    await page.keyboard.press('Enter')
    await page.waitForSelector('[data-slot="dropdown-menu-content"]')
    const menuState = await page.$eval('[data-slot="dropdown-menu-content"]', (menu) => ({
      text: menu.textContent ?? '',
      itemCount: menu.querySelectorAll('[data-slot="dropdown-menu-item"]').length,
    }))
    check(menuState.text.includes('Collapse') && menuState.itemCount >= 1, `card menu ${index + 1} opens from the keyboard`)
    await page.keyboard.press('Escape')
    await page.waitForSelector('[data-slot="dropdown-menu-content"]', { hidden: true })
  }

  const mapFocus = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.trim() === 'Open the map')
    if (!(button instanceof HTMLButtonElement)) return false
    button.focus()
    return document.activeElement === button
  })
  check(mapFocus, 'Open the map receives keyboard focus at 320px')
}

async function checkRepresentativeLongValues(page) {
  await openStandalone(page, 'owner', 320, 800, 'extra-large')
  const stressState = await page.evaluate(() => {
    const samples = ['₱999,999,999,999.99', '9,999 / 10,000']
    const values = [...document.querySelectorAll('[data-dashboard-card-value]')]
    values.forEach((value, index) => {
      value.textContent = samples[index % samples.length]
    })
    return values.map((value) => {
      const card = value.closest('[data-dashboard-card]')
      const valueRect = value.getBoundingClientRect()
      const cardRect = card?.getBoundingClientRect()
      return {
        cardOverflow: card ? card.scrollWidth - card.clientWidth : Number.POSITIVE_INFINITY,
        contained: Boolean(cardRect && valueRect.left >= cardRect.left - 1 && valueRect.right <= cardRect.right + 1),
      }
    })
  })
  check(
    stressState.length > 0 && stressState.every((value) => value.cardOverflow <= 1 && value.contained),
    '320px Extra Large cards contain representative long financial and numeric values',
    `${stressState.length} values`,
  )
}

async function checkMapPanel(page, userId, width, height, label) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, hasTouch: false, isMobile: false })
  await seed(page, userId)
  await open(page, '/map')
  const baseline = await page.evaluate(() => {
    const expand = document.querySelector('button[aria-label="Expand dashboard"]')
    const panel = expand?.closest('aside')
    const mapContent = document.querySelector('#map-dashboard-slot')?.previousElementSibling
    if (mapContent) mapContent.setAttribute('data-dashboard-map-identity', 'preserved')
    return {
      hasSlot: Boolean(document.querySelector('#map-dashboard-slot')),
      panelWidth: panel?.getBoundingClientRect().width ?? 0,
      cardIds: [...document.querySelectorAll('[data-dashboard-card]')].map((card) => card.getAttribute('data-dashboard-card')),
      optionOpacity: [...document.querySelectorAll('[data-dashboard-card-options]')].map((button) => getComputedStyle(button).opacity),
    }
  })
  check(baseline.hasSlot && Math.abs(baseline.panelWidth - 420) <= 1, `${label} docked panel keeps 420px geometry`, `${baseline.panelWidth}px`)
  check(baseline.cardIds[0] === 'collections' && baseline.cardIds.includes('attention'), `${label} docked panel keeps manifest order`, baseline.cardIds.join(', '))
  check(baseline.optionOpacity.every((opacity) => opacity === '0'), `${label} map-panel options keep hover/focus reveal`)

  await page.evaluate(() => document.querySelector('button[aria-label="Expand dashboard"]')?.click())
  await wait(500)
  const full = await page.evaluate(() => {
    const strip = document.querySelector('button[aria-label="Return to the map"]')
    const mapContent = document.querySelector('[data-dashboard-map-identity="preserved"]')
    return {
      backAction: [...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === 'Back to the map'),
      stripHeight: strip?.getBoundingClientRect().height ?? 0,
      mapContentPreserved: Boolean(mapContent?.isConnected),
      cardIds: [...document.querySelectorAll('[data-dashboard-card]')].map((card) => card.getAttribute('data-dashboard-card')),
    }
  })
  check(full.backAction && Math.abs(full.stripHeight - 240) <= 1, `${label} full panel keeps header and 240px map strip`, `${full.stripHeight}px`)
  check(full.mapContentPreserved, `${label} map content remains mounted in full state`)
  check(full.cardIds.join('|') === baseline.cardIds.join('|'), `${label} full panel keeps manifest order`, full.cardIds.join(', '))

  await page.click('[data-dashboard-card-options]')
  await page.waitForSelector('[data-slot="dropdown-menu-content"]')
  const menuText = await page.$eval('[data-slot="dropdown-menu-content"]', (menu) => menu.textContent ?? '')
  check(menuText.includes('Open full screen'), `${label} map-panel menu retains Open full screen`)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `${EVIDENCE_DIR}/${label.replaceAll(' ', '-')}-map-full.png`, fullPage: false })

  await page.evaluate(() => document.querySelector('button[aria-label="Return to the map"]')?.click())
  await wait(450)
  await page.evaluate(() => document.querySelector('button[aria-label="Hide dashboard"]')?.click())
  await wait(450)
  const hiddenWidth = await page.evaluate(() => document.querySelector('button[aria-label="Open dashboard"]')?.closest('aside')?.getBoundingClientRect().width ?? 0)
  check(Math.abs(hiddenWidth - 36) <= 1, `${label} hidden rail keeps 36px geometry`, `${hiddenWidth}px`)
}

mkdirSync(EVIDENCE_DIR, { recursive: true })

const browser = await puppeteer.launch({
  executablePath,
  headless: !HEADFUL,
  defaultViewport: { width: 1440, height: 900 },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(String(error.message ?? error)))

  console.log('\nOwner responsive matrix')
  for (const entry of OWNER_MATRIX) {
    pageErrors.length = 0
    await checkStandaloneCase(page, 'owner', entry.width, entry.height)
    check(pageErrors.length === 0, `owner ${entry.width}px has no uncaught page errors`, pageErrors[0] ?? '')
    if (entry.width === 320 || entry.width === 1440 || entry.width === 1920) {
      await page.screenshot({ path: `${EVIDENCE_DIR}/owner-${entry.width}px.png`, fullPage: false })
    }
  }

  console.log('\nRole matrix')
  for (const [role, widths] of Object.entries(ROLE_MATRIX)) {
    for (const width of widths) {
      pageErrors.length = 0
      await checkStandaloneCase(page, role, width, width === 320 ? 800 : 900)
      check(pageErrors.length === 0, `${role} ${width}px has no uncaught page errors`, pageErrors[0] ?? '')
    }
  }

  console.log('\nExtra Large text matrix')
  for (const width of [320, 768, 1400]) {
    pageErrors.length = 0
    await checkStandaloneCase(page, 'owner', width, 900, 'extra-large')
    check(pageErrors.length === 0, `owner ${width}px extra-large has no uncaught page errors`, pageErrors[0] ?? '')
  }

  console.log('\nBreakpoint boundaries')
  for (const width of BOUNDARY_WIDTHS) {
    pageErrors.length = 0
    await checkStandaloneCase(page, 'owner', width, 900)
    check(pageErrors.length === 0, `owner ${width}px boundary has no uncaught page errors`, pageErrors[0] ?? '')
  }

  console.log('\nStandalone interactions')
  await checkStandaloneMenu(page)
  await checkPeriodInteraction(page)
  await checkKeyboardAndTouchAccess(page)
  await checkRepresentativeLongValues(page)

  console.log('\nMap-panel regression')
  await checkMapPanel(page, ROLE_CASES.owner.id, 1440, 900, 'owner-1440')
  await checkMapPanel(page, ROLE_CASES.manager.id, 1024, 768, 'manager-1024')

  const summary = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    browser: executablePath,
    checks,
    failures,
    results,
  }
  writeFileSync(`${EVIDENCE_DIR}/dashboard-responsive-results.json`, `${JSON.stringify(summary, null, 2)}\n`)
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} — ${checks} checks\n`)
process.exit(failures === 0 ? 0 : 1)
