/**
 * Focused contract and browser acceptance for the responsive shell.
 *
 *   BASE_URL=http://127.0.0.1:1616 npm run qa:shell
 *   BROWSER_PATH=/path/to/chromium npm run qa:shell
 */
import { existsSync, readFileSync } from 'node:fs'
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

const ADMIN_ID = 'usr_002'
const ACCESSIBILITY_KEY = 'shelter-accessibility'
const PANEL_KEY = 'shelter-panel'
const MAP_KEY = 'shelter-map'
const MOBILE_NAVIGATION_BACKDROP_LAYER = 1000
const MOBILE_NAVIGATION_CONTENT_LAYER = 1010
const ROUTE_LAYER_CEILING = 999
const authenticatedRoutes = [
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
const viewportMatrix = [
  { name: 'minimum-mobile', width: 320, height: 568 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'small-tablet-portrait', width: 640, height: 960 },
  { name: 'tablet-portrait', width: 768, height: 1024 },
  { name: 'small-tablet-landscape', width: 960, height: 640 },
  { name: 'tablet-landscape', width: 1024, height: 768 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1680', width: 1680, height: 1050 },
  { name: 'desktop-2000', width: 2000, height: 1000 },
]

let checks = 0
let failures = 0

function check(condition, message, detail = '') {
  checks++
  console.log(`${condition ? '  ok  ' : '  FAIL'} ${message}${detail ? ` — ${detail}` : ''}`)
  if (!condition) failures++
}

async function waitForAction(page, id) {
  await page.waitForFunction(
    (expectedId) =>
      document.querySelectorAll('[data-shell-route-action]').length === 1 &&
      document
        .querySelector('[data-shell-route-action]')
        ?.getAttribute('data-route-action-id') === expectedId,
    { timeout: 3_000 },
    id,
  )
}

async function clickWithoutFocus(page, selector) {
  await page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${target}`)
    }
    element.click()
  }, selector)
}

async function openFixture(page) {
  await page.goto(`${BASE_URL}/qa/fixtures/responsive-shell-action.html`, {
    waitUntil: 'networkidle2',
    timeout: 30_000,
  })
  await page.waitForSelector('[data-fixture-top-bar]')
  await waitForAction(page, 'action-a')
}

async function openNavigationLayerFixture(page) {
  await page.goto(
    `${BASE_URL}/qa/fixtures/responsive-shell-action.html?navigation-layer`,
    {
      waitUntil: 'networkidle2',
      timeout: 30_000,
    },
  )
  await page.waitForSelector('[data-navigation-layer-fixture]')
}

async function seedApp(
  page,
  textSize = 'standard',
  railOpen = true,
  mapPresentation = 'list',
  panelState = 'docked',
) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ({
      userId,
      preferenceKey,
      panelKey,
      mapKey,
      size,
      isRailOpen,
      presentation,
      dashboardState,
    }) => {
      localStorage.clear()
      localStorage.setItem(
        'shelter-session',
        JSON.stringify({
          state: { currentUserId: userId, activeLocationId: null },
          version: 0,
        }),
      )
      localStorage.setItem(
        preferenceKey,
        JSON.stringify({
          state: {
            textSize: size,
            contrast: 'standard',
            motion: 'reduced',
            mapPresentation: presentation,
          },
          version: 1,
        }),
      )
      localStorage.setItem(
        panelKey,
        JSON.stringify({
          state: {
            state: dashboardState,
            lastDocked: dashboardState === 'hidden' ? 'hidden' : 'docked',
            period: 'month',
            collapsedCards: [],
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        mapKey,
        JSON.stringify({
          state: {
            viewMode: 'status',
            baseLayer: 'plain',
            showOverlay: false,
            overlayOpacity: 35,
            legendCollapsed: true,
          },
          version: 0,
        }),
      )
      localStorage.setItem('shelter-rail-open', isRailOpen ? '1' : '0')
      localStorage.setItem('shelter-theme', 'light')
    },
    {
      userId: ADMIN_ID,
      preferenceKey: ACCESSIBILITY_KEY,
      panelKey: PANEL_KEY,
      mapKey: MAP_KEY,
      size: textSize,
      isRailOpen: railOpen,
      presentation: mapPresentation,
      dashboardState: panelState,
    },
  )
}

async function waitForMobileNavigationOpen(page) {
  await page.waitForSelector(
    '[data-shell-mobile-navigation][data-state=open]',
  )
  await page.waitForSelector(
    'body > [data-slot=sheet-overlay][data-state=open]',
  )
  await page.waitForFunction(() => {
    const sheet = document.querySelector(
      '[data-shell-mobile-navigation][data-state=open]',
    )
    if (!sheet) return false
    const rect = sheet.getBoundingClientRect()
    const expectedLeft = Number.parseFloat(getComputedStyle(sheet).left) || 0
    return (
      Math.abs(rect.left - expectedLeft) <= 1 &&
      rect.width > 0 &&
      sheet.contains(document.activeElement)
    )
  })
}

async function waitForMobileNavigationClosed(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-shell-mobile-navigation]') &&
      !document.querySelector('body > [data-slot=sheet-overlay]'),
  )
}

async function mobileNavigationLayerState(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector(
      '[data-shell-mobile-navigation][data-state=open]',
    )
    const overlay = document.querySelector(
      'body > [data-slot=sheet-overlay][data-state=open]',
    )
    const blocker = document.querySelector('[data-route-layer-blocker]')
    const dashboard = document.querySelector('#map-dashboard-slot')
    const sheetRect = sheet?.getBoundingClientRect()

    if (!sheet || !overlay || !sheetRect) return null

    const insidePoint = {
      x: Math.min(window.innerWidth - 1, Math.round(sheetRect.left + 24)),
      y: Math.min(window.innerHeight - 1, Math.round(sheetRect.top + 100)),
    }
    const outsidePoint = {
      x: Math.min(
        window.innerWidth - 4,
        Math.max(Math.ceil(sheetRect.right) + 8, window.innerWidth - 12),
      ),
      y: Math.min(window.innerHeight - 4, Math.round(sheetRect.top + 100)),
    }
    const insideHit = document.elementFromPoint(insidePoint.x, insidePoint.y)
    const outsideHit = document.elementFromPoint(outsidePoint.x, outsidePoint.y)

    return {
      contentLayer: Number.parseInt(getComputedStyle(sheet).zIndex, 10),
      backdropLayer: Number.parseInt(getComputedStyle(overlay).zIndex, 10),
      blockerLayer: blocker
        ? Number.parseInt(getComputedStyle(blocker).zIndex, 10)
        : null,
      dashboardLayer: dashboard
        ? Number.parseInt(getComputedStyle(dashboard).zIndex, 10)
        : null,
      insideHitIsSheet: !!insideHit && sheet.contains(insideHit),
      outsideHitIsBackdrop: outsideHit === overlay,
      activeInside: sheet.contains(document.activeElement),
      bodyScrollLocked:
        document.body.hasAttribute('data-scroll-locked') ||
        getComputedStyle(document.body).overflow === 'hidden',
      outsidePoint,
    }
  })
}

async function preservedMapState(page) {
  return page.evaluate(
    ({ preferenceKey, panelKey, mapKey }) => {
      const readState = (key) => {
        const value = localStorage.getItem(key)
        return value ? JSON.parse(value).state ?? null : null
      }
      const accessibility = readState(preferenceKey)
      const panel = readState(panelKey)
      const map = readState(mapKey)

      return JSON.stringify({
        mapPresentation: accessibility?.mapPresentation ?? null,
        panel: panel
          ? {
              state: panel.state,
              lastDocked: panel.lastDocked,
              period: panel.period,
              collapsedCards: panel.collapsedCards,
            }
          : null,
        map,
      })
    },
    {
      preferenceKey: ACCESSIBILITY_KEY,
      panelKey: PANEL_KEY,
      mapKey: MAP_KEY,
    },
  )
}

async function focusIsInsideMobileNavigation(page) {
  return page.evaluate(() => {
    const sheet = document.querySelector(
      '[data-shell-mobile-navigation][data-state=open]',
    )
    return !!sheet && sheet.contains(document.activeElement)
  })
}

const lotDetailSource = readFileSync(
  new URL('../src/features/lot-detail/LotDetailDrawer.tsx', import.meta.url),
  'utf8',
)
const lotDetailLayer = Number.parseInt(
  lotDetailSource.match(/z-\[(\d+)\]/)?.[1] ?? '',
  10,
)

async function openApp(page, path) {
  await page.goto(`${BASE_URL}${path}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  })
  await page.waitForSelector('[data-shell-frame]')
  await page.waitForFunction(
    () => {
      const main = document.querySelector('[data-shell-main]')
      const text = main?.textContent?.trim() ?? ''
      return text.length > 20 && !text.includes('Loading…')
    },
    { timeout: 10_000 },
  )
}

async function shellState(page) {
  return page.evaluate(() => {
    const frame = document.querySelector('[data-shell-frame]')
    const topBar = document.querySelector('[data-shell-top-bar]')
    const main = document.querySelector('[data-shell-main]')
    const navigation = document.querySelector('[aria-label="Open navigation"]')
    const notifications = document.querySelector('[aria-label^="Notifications"]')
    const frameRect = frame?.getBoundingClientRect()
    const topBarRect = topBar?.getBoundingClientRect()
    const mainRect = main?.getBoundingClientRect()
    const navigationRect = navigation?.getBoundingClientRect()
    const notificationRect = notifications?.getBoundingClientRect()

    return {
      crashed: document.body.innerText.includes('Something went wrong'),
      forbidden: document.body.innerText.includes("don't have access"),
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      routeActionCount: document.querySelectorAll('[data-shell-route-action]').length,
      frame: frameRect
        ? {
            top: frameRect.top,
            right: frameRect.right,
            bottom: frameRect.bottom,
            left: frameRect.left,
          }
        : null,
      topBar: topBarRect
        ? {
            top: topBarRect.top,
            right: topBarRect.right,
            bottom: topBarRect.bottom,
            left: topBarRect.left,
          }
        : null,
      main: mainRect
        ? {
            top: mainRect.top,
            right: mainRect.right,
            bottom: mainRect.bottom,
            left: mainRect.left,
          }
        : null,
      navigationTarget: navigationRect
        ? { width: navigationRect.width, height: navigationRect.height }
        : null,
      notificationTarget: notificationRect
        ? { width: notificationRect.width, height: notificationRect.height }
        : null,
    }
  })
}

const browser = await puppeteer.launch({
  executablePath,
  headless: !HEADFUL,
  defaultViewport: { width: 390, height: 844 },
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const fixturePage = await browser.newPage()
  const fixtureErrors = []
  fixturePage.on('pageerror', (error) => {
    fixtureErrors.push(String(error.message ?? error))
  })

  console.log('\nRoute action contract')
  await openFixture(fixturePage)
  const initial = await fixturePage.evaluate(() => {
    const action = document.querySelector('[data-shell-route-action]')
    const rect = action?.getBoundingClientRect()
    return {
      count: document.querySelectorAll('[data-shell-route-action]').length,
      name: action?.getAttribute('aria-label'),
      id: action?.getAttribute('data-route-action-id'),
      native: action instanceof HTMLButtonElement,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
      badge: action?.querySelector('[data-shell-route-action-badge]')?.textContent,
      providerError: document
        .querySelector('[data-provider-error]')
        ?.getAttribute('data-provider-error'),
    }
  })
  check(initial.count === 1 && initial.id === 'action-a', 'Strict Mode leaves one current registration', JSON.stringify(initial))
  check(initial.native && initial.width >= 44 && initial.height >= 44, 'Route action is a native 44px target', `${initial.width}x${initial.height}`)
  check(initial.badge === '5' && initial.name?.includes('5 items need attention'), 'Positive badge is visible and included in the accessible name', initial.name)
  check(
    initial.providerError ===
      'useRouteTopBarAction must be used inside RouteTopBarActionProvider',
    'Missing-provider usage fails with the documented developer error',
    initial.providerError,
  )

  await fixturePage.focus('[data-shell-route-action]')
  await clickWithoutFocus(fixturePage, '[data-count-eight]')
  await fixturePage.waitForFunction(
    () =>
      document
        .querySelector('[data-shell-route-action]')
        ?.getAttribute('aria-label')
        ?.includes('8 items need attention') &&
      document.activeElement?.hasAttribute('data-shell-route-action'),
  )
  check(true, 'Count updates in place without moving focus')

  await clickWithoutFocus(fixturePage, '[data-count-cap]')
  await fixturePage.waitForFunction(
    () =>
      document.querySelector('[data-shell-route-action-badge]')
        ?.textContent === '99+',
  )
  check(true, 'Visual badge caps values above 99 at 99+')

  await clickWithoutFocus(fixturePage, '[data-count-zero]')
  await fixturePage.waitForFunction(
    () =>
      !document.querySelector(
        '[data-shell-route-action-badge]',
      ),
  )
  check(true, 'Zero hides the visual badge')
  await clickWithoutFocus(fixturePage, '[data-count-negative]')
  check(
    await fixturePage.evaluate(
      () =>
        !document.querySelector(
          '[data-shell-route-action-badge]',
        ),
    ),
    'Negative counts keep the visual badge hidden',
  )

  await clickWithoutFocus(fixturePage, '[data-count-eight]')
  await clickWithoutFocus(fixturePage, '[data-update-label]')
  await fixturePage.waitForFunction(
    () =>
      document
        .querySelector('[data-shell-route-action]')
        ?.getAttribute('aria-label')
        ?.startsWith('Open attention dashboard'),
  )
  await fixturePage.hover('[data-shell-route-action]')
  await fixturePage.waitForFunction(
    () =>
      document.querySelector('[data-slot=tooltip-content]')?.textContent ===
      'Open attention dashboard',
  )
  check(true, 'Updated action label is visible in the existing tooltip')

  await clickWithoutFocus(fixturePage, '[data-update-callback]')
  await fixturePage.click('[data-shell-route-action]')
  await fixturePage.waitForFunction(
    () => document.querySelector('[data-activation]')?.textContent === 'action-a-v2',
  )
  check(true, 'Updated activation callback is used without remounting the action')

  await clickWithoutFocus(fixturePage, '[data-toggle-disabled]')
  await fixturePage.waitForFunction(
    () => document.querySelector('[data-shell-route-action]')?.hasAttribute('disabled'),
  )
  check(true, 'Disabled updates use native button semantics')
  await clickWithoutFocus(fixturePage, '[data-toggle-disabled]')

  await clickWithoutFocus(fixturePage, '[data-toggle-b]')
  await waitForAction(fixturePage, 'action-b')
  check(true, 'A newer registration deterministically replaces the previous action')
  await clickWithoutFocus(fixturePage, '[data-toggle-a]')
  await waitForAction(fixturePage, 'action-b')
  check(true, 'Stale cleanup cannot clear the current registration')
  await clickWithoutFocus(fixturePage, '[data-toggle-b]')
  await fixturePage.waitForFunction(
    () => document.querySelectorAll('[data-shell-route-action]').length === 0,
  )
  check(
    await fixturePage.evaluate(
      () => document.querySelector('[data-fixture-slot]')?.childElementCount === 1,
    ),
    'Removing the newest registration does not revive the replaced action',
  )

  await clickWithoutFocus(fixturePage, '[data-toggle-a]')
  await waitForAction(fixturePage, 'action-a')
  await fixturePage.focus('[data-shell-route-action]')
  await clickWithoutFocus(fixturePage, '[data-toggle-a]')
  await fixturePage.waitForFunction(
    () =>
      document.querySelectorAll('[data-shell-route-action]').length === 0 &&
      document.activeElement?.id === 'main-content',
  )
  check(true, 'Same-route focused removal restores focus to main content')

  await clickWithoutFocus(fixturePage, '[data-toggle-a]')
  await waitForAction(fixturePage, 'action-a')
  await fixturePage.click('[data-go-two]')
  await fixturePage.waitForFunction(
    () =>
      document.querySelector('[data-harness-path]')?.textContent === '/two' &&
      document.querySelectorAll('[data-shell-route-action]').length === 0,
  )
  check(true, 'A route-key change hides the previous route action')
  await fixturePage.click('[data-go-one]')
  await fixturePage.waitForFunction(
    () => document.querySelector('[data-harness-path]')?.textContent === '/one',
  )
  await waitForAction(fixturePage, 'action-a')
  check(true, 'The active route can register a fresh action after navigation')

  await fixturePage.setViewport({ width: 320, height: 568 })
  await fixturePage.evaluate(() => {
    document.documentElement.dataset.textSize = 'extra-large'
  })
  const fixtureLayout = await fixturePage.evaluate(() => {
    const controls = [
      document.querySelector('[aria-label="Open navigation"]'),
      document.querySelector('[data-shell-route-action]'),
      document.querySelector('[aria-label="Notifications"]'),
    ]
    return {
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      targets: controls.map((control) => {
        const rect = control?.getBoundingClientRect()
        return rect ? [rect.width, rect.height] : [0, 0]
      }),
    }
  })
  check(fixtureLayout.overflow <= 1, '320px fixture has no horizontal clipping', `${fixtureLayout.overflow}px`)
  check(
    fixtureLayout.targets.every(([width, height]) => width >= 44 && height >= 44),
    'Navigation, route action, and notifications retain 44px targets at 320px',
    JSON.stringify(fixtureLayout.targets),
  )
  check(fixtureErrors.length === 0, 'Action harness has no uncaught page errors', fixtureErrors[0] ?? '')
  await fixturePage.close()

  console.log('\nMobile-navigation route-layer ceiling')
  check(
    lotDetailLayer === 650 && lotDetailLayer < ROUTE_LAYER_CEILING,
    'Current lot-detail layer remains below the reserved route ceiling',
    `lot detail ${lotDetailLayer}; ceiling ${ROUTE_LAYER_CEILING}`,
  )

  const layerPage = await browser.newPage()
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    await layerPage.setViewport(viewport)
    await openNavigationLayerFixture(layerPage)
    await layerPage.click('[aria-label="Open navigation layer fixture"]')
    await waitForMobileNavigationOpen(layerPage)

    const layerState = await mobileNavigationLayerState(layerPage)
    check(
      layerState?.contentLayer === MOBILE_NAVIGATION_CONTENT_LAYER &&
        layerState?.backdropLayer === MOBILE_NAVIGATION_BACKDROP_LAYER &&
        layerState?.blockerLayer === ROUTE_LAYER_CEILING,
      `${viewport.width}px shell navigation reserves layers 1000 and 1010 above route layer 999`,
      JSON.stringify(layerState),
    )
    check(
      layerState?.insideHitIsSheet && layerState?.outsideHitIsBackdrop,
      `${viewport.width}px pointer hit testing resolves to navigation and backdrop`,
      JSON.stringify(layerState),
    )
    check(
      layerState?.activeInside && layerState?.bodyScrollLocked,
      `${viewport.width}px open navigation contains focus and locks body scrolling`,
      JSON.stringify(layerState),
    )

    await layerPage.keyboard.press('Tab')
    const forwardFocusContained = await focusIsInsideMobileNavigation(layerPage)
    await layerPage.keyboard.down('Shift')
    await layerPage.keyboard.press('Tab')
    await layerPage.keyboard.up('Shift')
    check(
      forwardFocusContained &&
        (await focusIsInsideMobileNavigation(layerPage)),
      `${viewport.width}px Tab and Shift+Tab stay within navigation`,
    )

    await layerPage.keyboard.press('Escape')
    await waitForMobileNavigationClosed(layerPage)
    check(
      await layerPage.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Open navigation layer fixture',
      ),
      `${viewport.width}px Escape restores focus to the navigation trigger`,
    )
  }

  await layerPage.setViewport({ width: 390, height: 844 })
  await openNavigationLayerFixture(layerPage)
  await layerPage.click('[aria-label="Open navigation layer fixture"]')
  await waitForMobileNavigationOpen(layerPage)
  let layerState = await mobileNavigationLayerState(layerPage)
  await layerPage.mouse.click(
    layerState?.outsidePoint.x ?? 378,
    layerState?.outsidePoint.y ?? 100,
  )
  await waitForMobileNavigationClosed(layerPage)
  check(
    await layerPage.evaluate(
      () =>
        document.querySelector('[data-route-layer-blocker-activations]')
          ?.textContent === '0' &&
        document.activeElement?.getAttribute('aria-label') ===
          'Open navigation layer fixture',
    ),
    'Backdrop dismissal blocks the route-owned control and restores trigger focus',
  )

  await layerPage.click('[aria-label="Open navigation layer fixture"]')
  await waitForMobileNavigationOpen(layerPage)
  await layerPage.click(
    '[data-shell-mobile-navigation] button:has(> .sr-only)',
  )
  await waitForMobileNavigationClosed(layerPage)
  check(
    await layerPage.evaluate(
      () =>
        document.activeElement?.getAttribute('aria-label') ===
        'Open navigation layer fixture',
    ),
    'Close-button dismissal restores focus to the navigation trigger',
  )
  await layerPage.close()

  console.log('\nAuthenticated shell viewport matrix')
  const appPage = await browser.newPage()
  const appErrors = []
  appPage.on('pageerror', (error) => {
    appErrors.push(String(error.message ?? error))
  })

  await seedApp(appPage, 'extra-large')
  for (const viewport of viewportMatrix) {
    await appPage.setViewport({ width: viewport.width, height: viewport.height })
    await openApp(appPage, '/sales')
    const state = await shellState(appPage)
    check(!state.crashed && !state.forbidden, `${viewport.name} shell renders the authenticated route`)
    check(state.overflow <= 1, `${viewport.name} has no document horizontal clipping`, `${state.overflow}px`)
    check(state.routeActionCount === 0, `${viewport.name} empty route-action slot consumes no DOM`)
    check(
      (state.notificationTarget?.width ?? 0) >= 44 &&
        (state.notificationTarget?.height ?? 0) >= 44,
      `${viewport.name} notification target remains at least 44px`,
      JSON.stringify(state.notificationTarget),
    )
    if (viewport.width < 1024) {
      check(
        (state.navigationTarget?.width ?? 0) >= 44 &&
          (state.navigationTarget?.height ?? 0) >= 44,
        `${viewport.name} compact navigation target remains at least 44px`,
        JSON.stringify(state.navigationTarget),
      )
    }
  }

  console.log('\nSafe-area and viewport-height geometry')
  await appPage.setViewport({ width: 390, height: 844 })
  await openApp(appPage, '/sales')
  await appPage.evaluate(() => {
    const root = document.documentElement
    root.style.setProperty('--shell-safe-top', '13px')
    root.style.setProperty('--shell-safe-right', '19px')
    root.style.setProperty('--shell-safe-bottom', '23px')
    root.style.setProperty('--shell-safe-left', '17px')
  })
  await appPage.waitForFunction(() => {
    const frame = document.querySelector('[data-shell-frame]')
    if (!frame) return false
    const style = getComputedStyle(frame)
    return (
      style.paddingTop === '13px' &&
      style.paddingRight === '19px' &&
      style.paddingBottom === '23px' &&
      style.paddingLeft === '17px'
    )
  })
  const safeFrame = await appPage.evaluate(() => {
    const frame = document.querySelector('[data-shell-frame]')
    const topBar = document.querySelector('[data-shell-top-bar]')
    const main = document.querySelector('[data-shell-main]')
    const skip = document.querySelector('[data-shell-skip-link]')
    if (!frame || !topBar || !main || !skip) return null
    const style = getComputedStyle(frame)
    const topBarRect = topBar.getBoundingClientRect()
    const mainRect = main.getBoundingClientRect()
    const skipStyle = getComputedStyle(skip)
    return {
      padding: [
        style.paddingTop,
        style.paddingRight,
        style.paddingBottom,
        style.paddingLeft,
      ],
      topBar: [topBarRect.top, topBarRect.right, topBarRect.left],
      mainBottom: mainRect.bottom,
      skip: [skipStyle.top, skipStyle.left],
    }
  })
  check(
    JSON.stringify(safeFrame?.padding) ===
      JSON.stringify(['13px', '19px', '23px', '17px']),
    'Authenticated frame consumes all four safe-area variables once',
    JSON.stringify(safeFrame),
  )
  check(
    safeFrame?.topBar[0] === 13 &&
      safeFrame?.topBar[1] === 371 &&
      safeFrame?.topBar[2] === 17 &&
      safeFrame?.mainBottom === 821,
    'Top bar and main content stay inside the safe frame',
    JSON.stringify(safeFrame),
  )
  check(
    JSON.stringify(safeFrame?.skip) === JSON.stringify(['25px', '29px']),
    'Skip link offsets from safe top and left',
    JSON.stringify(safeFrame?.skip),
  )

  await appPage.click('[aria-label="Open navigation"]')
  await appPage.waitForSelector('[data-shell-mobile-navigation][data-state=open]')
  await appPage.waitForFunction(() => {
    const sheet = document.querySelector('[data-shell-mobile-navigation]')
    if (!sheet) return false
    const rect = sheet.getBoundingClientRect()
    return (
      Math.abs(rect.top - 13) <= 1 &&
      Math.abs(rect.bottom - (window.innerHeight - 23)) <= 1 &&
      Math.abs(rect.left - 17) <= 1
    )
  })
  const mobileSheet = await appPage.evaluate(() => {
    const sheet = document.querySelector('[data-shell-mobile-navigation]')
    const footer = sheet?.querySelector(
      '[data-shell-mobile-navigation-footer]',
    )
    const sheetRect = sheet?.getBoundingClientRect()
    const footerRect = footer?.getBoundingClientRect()
    return {
      sheet: sheetRect
        ? [sheetRect.top, sheetRect.right, sheetRect.bottom, sheetRect.left]
        : null,
      footerBottom: footerRect?.bottom ?? 0,
      path: window.location.pathname,
    }
  })
  check(
    mobileSheet.sheet?.[0] === 13 &&
      mobileSheet.sheet?.[2] === 821 &&
      mobileSheet.sheet?.[3] === 17 &&
      mobileSheet.footerBottom <= 821,
    'Portaled mobile navigation respects safe top, bottom, and left boundaries',
    JSON.stringify(mobileSheet),
  )

  await appPage.setViewport({ width: 390, height: 568 })
  await appPage.waitForFunction(() => {
    const sheet = document.querySelector('[data-shell-mobile-navigation]')
    if (!sheet) return false
    return Math.abs(sheet.getBoundingClientRect().bottom - 545) <= 1
  })
  check(
    await appPage.evaluate(
      () =>
        window.location.pathname === '/sales' &&
        document
          .querySelector('[data-shell-mobile-navigation-footer]')
          ?.getBoundingClientRect().bottom <= 545,
    ),
    'Viewport-height shrink preserves route state and reachable sheet footer',
  )

  await appPage.keyboard.press('Escape')
  await appPage.waitForFunction(
    () =>
      !document.querySelector(
        '[data-shell-mobile-navigation][data-state=open]',
      ),
  )

  console.log('\nRoute lifecycle and desktop rail regression')
  await appPage.evaluate(() => {
    const root = document.documentElement
    root.style.removeProperty('--shell-safe-top')
    root.style.removeProperty('--shell-safe-right')
    root.style.removeProperty('--shell-safe-bottom')
    root.style.removeProperty('--shell-safe-left')
  })
  await appPage.setViewport({ width: 320, height: 568 })
  for (const route of authenticatedRoutes) {
    await openApp(appPage, route)
    const state = await shellState(appPage)
    check(
      !state.crashed &&
        !state.forbidden &&
        state.overflow <= 1 &&
        state.routeActionCount === 0,
      `320px route sweep contains ${route}`,
      JSON.stringify({
        crashed: state.crashed,
        forbidden: state.forbidden,
        overflow: state.overflow,
        routeActionCount: state.routeActionCount,
      }),
    )
  }

  await seedApp(appPage, 'standard', false)
  await appPage.setViewport({ width: 1280, height: 800 })
  await openApp(appPage, '/sales')
  await appPage.waitForFunction(
    () => document.querySelector('aside')?.getBoundingClientRect().width <= 70,
  )
  check(
    await appPage.evaluate(
      () =>
        localStorage.getItem('shelter-rail-open') === '0' &&
        document.querySelector('aside')?.getBoundingClientRect().width === 68,
    ),
    'Collapsed desktop rail restores from its existing storage contract',
  )
  await appPage.click('[aria-label="Expand sidebar"]')
  await appPage.waitForFunction(
    () =>
      localStorage.getItem('shelter-rail-open') === '1' &&
      (document.querySelector('aside')?.getBoundingClientRect().width ?? 0) >=
        230,
  )
  await appPage.setViewport({ width: 390, height: 844 })
  await appPage.setViewport({ width: 2000, height: 1000 })
  await appPage.waitForFunction(
    () => (document.querySelector('aside')?.getBoundingClientRect().width ?? 0) >= 230,
  )
  check(
    await appPage.evaluate(
      () =>
        localStorage.getItem('shelter-rail-open') === '1' &&
        document.querySelector('aside')?.getBoundingClientRect().width === 232,
    ),
    'Expanded desktop rail persists across constrained and desktop widths',
  )

  console.log('\nMap mobile-navigation collision matrix')
  const dashboardSelectors = {
    hidden: '[aria-label="Open dashboard"]',
    docked: '[aria-label="Hide dashboard"]',
    full: '[aria-label="Return to the map"]',
  }
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
  ]) {
    for (const presentation of ['map', 'list']) {
      for (const panelState of ['hidden', 'docked', 'full']) {
        await seedApp(
          appPage,
          'standard',
          true,
          presentation,
          panelState,
        )
        await appPage.setViewport(viewport)
        await openApp(appPage, '/map')
        await appPage.waitForFunction(
          ({ expectedPresentation, expectedPanelState, selector }) => {
            const preference = JSON.parse(
              localStorage.getItem('shelter-accessibility') ?? '{}',
            ).state
            const panel = JSON.parse(
              localStorage.getItem('shelter-panel') ?? '{}',
            ).state
            if (
              preference?.mapPresentation !== expectedPresentation ||
              panel?.state !== expectedPanelState
            ) {
              return false
            }

            if (expectedPresentation === 'list') {
              return !document.querySelector('#map-dashboard-slot')
            }

            return (
              !!document.querySelector('#map-dashboard-slot') &&
              !!document.querySelector(selector)
            )
          },
          {},
          {
            expectedPresentation: presentation,
            expectedPanelState: panelState,
            selector: dashboardSelectors[panelState],
          },
        )

        const before = await preservedMapState(appPage)
        await appPage.click('[aria-label="Open navigation"]')
        await waitForMobileNavigationOpen(appPage)
        const collision = await mobileNavigationLayerState(appPage)

        check(
          collision?.contentLayer === MOBILE_NAVIGATION_CONTENT_LAYER &&
            collision?.backdropLayer ===
              MOBILE_NAVIGATION_BACKDROP_LAYER &&
            (presentation === 'list' || collision?.dashboardLayer === 630),
          `${viewport.width}px ${presentation}/${panelState} navigation paints above Map and Dashboard`,
          JSON.stringify(collision),
        )
        check(
          collision?.insideHitIsSheet && collision?.outsideHitIsBackdrop,
          `${viewport.width}px ${presentation}/${panelState} pointer hits stay on navigation and backdrop`,
          JSON.stringify(collision),
        )
        check(
          collision?.activeInside && collision?.bodyScrollLocked,
          `${viewport.width}px ${presentation}/${panelState} focus and scroll are modal`,
          JSON.stringify(collision),
        )

        await appPage.keyboard.press('Tab')
        const forwardFocusContained =
          await focusIsInsideMobileNavigation(appPage)
        await appPage.keyboard.down('Shift')
        await appPage.keyboard.press('Tab')
        await appPage.keyboard.up('Shift')
        check(
          forwardFocusContained &&
            (await focusIsInsideMobileNavigation(appPage)),
          `${viewport.width}px ${presentation}/${panelState} traps Tab in navigation`,
        )

        await appPage.keyboard.press('Escape')
        await waitForMobileNavigationClosed(appPage)
        const after = await preservedMapState(appPage)
        check(
          before === after &&
            (await appPage.evaluate(
              () =>
                window.location.pathname === '/map' &&
                document.activeElement?.getAttribute('aria-label') ===
                  'Open navigation',
            )),
          `${viewport.width}px ${presentation}/${panelState} Escape restores focus and preserves route state`,
          before === after ? '' : `${before} != ${after}`,
        )
      }
    }
  }

  await seedApp(appPage, 'standard', true, 'map', 'docked')
  await appPage.setViewport({ width: 390, height: 844 })
  await openApp(appPage, '/map')
  let beforeDismissal = await preservedMapState(appPage)
  await appPage.click('[aria-label="Open navigation"]')
  await waitForMobileNavigationOpen(appPage)
  let dismissalLayer = await mobileNavigationLayerState(appPage)
  await appPage.mouse.click(
    dismissalLayer?.outsidePoint.x ?? 378,
    dismissalLayer?.outsidePoint.y ?? 100,
  )
  await waitForMobileNavigationClosed(appPage)
  check(
    beforeDismissal === (await preservedMapState(appPage)) &&
      (await appPage.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Open navigation',
      )),
    'Map backdrop dismissal restores hamburger focus and preserves state',
  )

  beforeDismissal = await preservedMapState(appPage)
  await appPage.click('[aria-label="Open navigation"]')
  await waitForMobileNavigationOpen(appPage)
  await appPage.click(
    '[data-shell-mobile-navigation] button:has(> .sr-only)',
  )
  await waitForMobileNavigationClosed(appPage)
  check(
    beforeDismissal === (await preservedMapState(appPage)) &&
      (await appPage.evaluate(
        () =>
          document.activeElement?.getAttribute('aria-label') ===
          'Open navigation',
      )),
    'Map close-button dismissal restores hamburger focus and preserves state',
  )

  beforeDismissal = await preservedMapState(appPage)
  await appPage.click('[aria-label="Open navigation"]')
  await waitForMobileNavigationOpen(appPage)
  await appPage.evaluate(() => {
    const originalPushState = window.history.pushState.bind(window.history)
    window.__qaPushStateCount = 0
    window.history.pushState = (...args) => {
      window.__qaPushStateCount += 1
      return originalPushState(...args)
    }
  })
  await appPage.click(
    '[data-shell-mobile-navigation] a[href="/sales"]',
  )
  await appPage.waitForFunction(
    () =>
      window.location.pathname === '/sales' &&
      !document.querySelector(
        '[data-shell-mobile-navigation][data-state=open]',
      ) &&
      !document.body.hasAttribute('data-scroll-locked') &&
      document.activeElement?.id === 'main-content',
  )
  check(
    beforeDismissal === (await preservedMapState(appPage)) &&
      (await appPage.evaluate(() => window.__qaPushStateCount === 1)),
    'Navigation choice changes route once, clears modal state, focuses main, and preserves Map state',
  )

  check(appErrors.length === 0, 'Authenticated shell run has no uncaught page errors', appErrors[0] ?? '')
  await appPage.close()
} finally {
  await browser.close()
}

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`} — ${checks} checks\n`)
process.exit(failures === 0 ? 0 : 1)
