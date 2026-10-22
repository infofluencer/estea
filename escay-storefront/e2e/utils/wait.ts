import type { Page } from "@playwright/test"

/** Skip welcome + cookie banners for the whole browser context. */
export async function skipSiteOverlays(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("escay-welcome-popup", "1")
      localStorage.setItem("escay-cookie-consent", "necessary")
    } catch {
      /* ignore */
    }
  })
}

/** @deprecated use skipSiteOverlays */
export async function skipWelcomePopup(page: Page) {
  await skipSiteOverlays(page)
}

export async function waitForPageLoad(page: Page) {
  await page.waitForLoadState("domcontentloaded")
  await waitForPageLoaderGone(page)
}

/** Wait until the page-loader overlay is gone. */
export async function waitForPageLoaderGone(page: Page, timeout = 45_000) {
  const loader = page.locator(
    '[data-page-loader="true"][aria-busy="true"], .page-loader[aria-busy="true"]'
  )
  try {
    await loader.first().waitFor({ state: "hidden", timeout })
  } catch {
    /* may never appear */
  }
  await page
    .locator(".page-loader[aria-hidden='false']")
    .waitFor({ state: "hidden", timeout: 5_000 })
    .catch(() => undefined)
}

export async function dismissWelcomeIfPresent(page: Page) {
  const backdrop = page.locator(
    '.welcome-popup__backdrop, .welcome-popup__close, .welcome-popup [aria-label="Kapat"]'
  )
  if (await backdrop.first().isVisible().catch(() => false)) {
    await backdrop.first().click({ force: true }).catch(() => undefined)
    await page.waitForTimeout(200)
  }
}

export async function dismissCookieIfPresent(page: Page) {
  const accept = page.getByRole("button", {
    name: /Tümünü kabul et|Reddet|Accept/i,
  })
  if (await accept.first().isVisible().catch(() => false)) {
    await accept.first().click({ force: true }).catch(() => undefined)
    await page.waitForTimeout(200)
  }
}

export async function dismissOverlays(page: Page) {
  await dismissWelcomeIfPresent(page)
  await dismissCookieIfPresent(page)
  await waitForPageLoaderGone(page)
}

export async function assertNoHorizontalOverflow(page: Page, slack = 16) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  if (scrollWidth > clientWidth + slack) {
    throw new Error(
      `Horizontal overflow: scroll=${scrollWidth} client=${clientWidth}`
    )
  }
}
