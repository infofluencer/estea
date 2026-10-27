import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class RegisterPage {
  readonly page: Page
  readonly first: Locator
  readonly last: Locator
  readonly email: Locator
  readonly password: Locator
  readonly passwordConfirm: Locator
  readonly submit: Locator
  readonly error: Locator
  readonly pending: Locator

  constructor(page: Page) {
    this.page = page
    this.first = page.locator("#reg-first")
    this.last = page.locator("#reg-last")
    this.email = page.locator("#reg-email")
    this.password = page.locator("#reg-password")
    this.passwordConfirm = page.locator("#reg-password-confirm")
    this.submit = page.getByTestId("register-submit")
    this.error = page.getByTestId("register-error")
    // Prefer testid only — "E-posta Doğrulama" heading is inside register-pending
    this.pending = page.getByTestId("register-pending")
  }

  async goto() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/?register=1", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.email.waitFor({ state: "visible", timeout: 15_000 })
  }

  async submitForm(input: {
    email: string
    password: string
    first?: string
    last?: string
  }) {
    await this.first.fill(input.first || "Staging")
    await this.last.fill(input.last || "E2E")
    await this.email.fill(input.email)
    await this.password.fill(input.password)
    await this.passwordConfirm.fill(input.password)
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.submit.click()
  }
}
