import type { Locator, Page } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

export class AuthPage {
  readonly page: Page
  readonly forgotEmail: Locator
  readonly forgotSubmit: Locator
  readonly forgotSuccess: Locator
  readonly resetForm: Locator
  readonly resetInvalid: Locator
  readonly resetError: Locator
  readonly newPassword: Locator
  readonly confirmPassword: Locator
  readonly resetSubmit: Locator
  readonly verifyPage: Locator

  constructor(page: Page) {
    this.page = page
    this.forgotEmail = page.getByTestId("forgot-email")
    this.forgotSubmit = page.getByTestId("forgot-submit")
    this.forgotSuccess = page.getByTestId("forgot-success")
    this.resetForm = page.getByTestId("reset-password-form")
    this.resetInvalid = page.getByTestId("reset-password-invalid")
    this.resetError = page.getByTestId("reset-password-error")
    this.newPassword = page.locator("#new-password")
    this.confirmPassword = page.locator("#confirm-password")
    this.resetSubmit = page.getByRole("button", { name: /Şifreyi güncelle/i })
    this.verifyPage = page.getByTestId("verify-email-page")
  }

  async gotoForgot() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/forgot-password", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async gotoReset(query = "") {
    await skipSiteOverlays(this.page)
    await this.page.goto(`/reset-password${query}`, {
      waitUntil: "domcontentloaded",
    })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async gotoVerify(query = "") {
    await skipSiteOverlays(this.page)
    await this.page.goto(`/verify-email${query}`, {
      waitUntil: "domcontentloaded",
    })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async requestReset(email: string) {
    await this.forgotEmail.fill(email)
    await this.forgotSubmit.click()
  }
}
