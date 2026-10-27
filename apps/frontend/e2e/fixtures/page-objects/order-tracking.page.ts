import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class OrderTrackingPage {
  readonly page: Page
  readonly orderId: Locator
  readonly email: Locator
  readonly submit: Locator
  readonly error: Locator

  constructor(page: Page) {
    this.page = page
    this.orderId = page.getByTestId("order-tracking-id").or(
      page.locator("#track-order-id")
    )
    this.email = page.getByTestId("order-tracking-email").or(
      page.locator("#track-email")
    )
    this.submit = page.getByTestId("order-tracking-submit")
    // Prefer testid only — broad text match races with labels / nested copy.
    this.error = page.getByTestId("order-tracking-error")
  }

  async goto() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/order-tracking", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async lookup(order: string, email: string) {
    await this.orderId.fill(order)
    await this.email.fill(email)
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.submit.click()
  }

  /**
   * Form submit + wait until order-detail is visible.
   * One soft retry only — lookup is rate-limited site-wide via FE SSR IP.
   */
  async lookupAndWait(order: string, email: string) {
    await this.goto()
    await this.lookup(order, email)

    const detail = this.detail()
    const formError = this.error
    const pageError = this.page.getByRole("heading", {
      name: /Sipariş bulunamadı/i,
    })

    const winner = await Promise.race([
      detail
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(() => "ok" as const),
      formError
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(async () => {
          const text = (await formError.textContent()) || "form error"
          return { kind: "form-error" as const, text }
        }),
      pageError
        .waitFor({ state: "visible", timeout: 45_000 })
        .then(async () => {
          const text =
            (await this.page
              .locator("p")
              .filter({ hasText: /Sipariş|kontrol|deneme/i })
              .first()
              .textContent()
              .catch(() => null)) || "result page not found"
          return { kind: "page-error" as const, text }
        }),
    ])

    if (winner === "ok") return

    const errText =
      typeof winner === "object" ? winner.text : "timeout"
    if (/çok fazla|rate|429/i.test(errText)) {
      throw new Error(
        `Lookup rate-limited for ${order}: ${errText} (staging ORDER_LOOKUP_RATE_MAX / backend redeploy)`
      )
    }

    // Single retry after short pause (avoid burning the shared SSR bucket).
    await this.page.waitForTimeout(1500)
    await this.goto()
    await this.lookup(order, email)
    await detail.waitFor({ state: "visible", timeout: 45_000 }).catch(() => {
      throw new Error(`Lookup failed for ${order} / ${email}: ${errText}`)
    })
  }

  /** @deprecated prefer lookupAndWait */
  async waitForResult() {
    await this.detail().waitFor({ state: "visible", timeout: 45_000 })
  }

  detail() {
    return this.page.getByTestId("order-detail")
  }
}
