import type { Page, Locator } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class AccountPage {
  readonly page: Page
  readonly loginEmail: Locator
  readonly loginPassword: Locator
  readonly loginSubmit: Locator
  readonly regFirst: Locator
  readonly regLast: Locator
  readonly regEmail: Locator
  readonly regPassword: Locator
  readonly regPasswordConfirm: Locator
  readonly registerSubmit: Locator
  readonly favoriteToggle: Locator

  constructor(page: Page) {
    this.page = page
    this.loginEmail = page.locator("#login-email")
    this.loginPassword = page.locator("#login-password")
    this.loginSubmit = page.getByTestId("login-submit")
    this.regFirst = page.locator("#reg-first")
    this.regLast = page.locator("#reg-last")
    this.regEmail = page.locator("#reg-email")
    this.regPassword = page.locator("#reg-password")
    this.regPasswordConfirm = page.locator("#reg-password-confirm")
    this.registerSubmit = page.getByTestId("register-submit")
    this.favoriteToggle = page.getByTestId("favorite-toggle").first()
  }

  async openRegister() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/?register=1", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.regEmail.waitFor({ state: "visible", timeout: 15_000 })
  }

  async openLogin() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/?login=1", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async register(input: {
    email: string
    password: string
    first?: string
    last?: string
  }) {
    await this.regFirst.fill(input.first || "Staging")
    await this.regLast.fill(input.last || "E2E")
    await this.regEmail.fill(input.email)
    await this.regPassword.fill(input.password)
    await this.regPasswordConfirm.fill(input.password)
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.registerSubmit.click()
  }

  async login(email: string, password: string) {
    await this.loginEmail.fill(email)
    await this.loginPassword.fill(password)
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.loginSubmit.click()
  }
}
