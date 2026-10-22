import type { Page, Locator } from "@playwright/test"

export class ReturnRequestPage {
  readonly page: Page
  readonly section: Locator
  readonly open: Locator
  readonly form: Locator
  readonly reason: Locator
  readonly note: Locator
  readonly submit: Locator
  readonly success: Locator
  readonly returnId: Locator
  readonly address: Locator
  readonly unavailable: Locator
  readonly qtyInputs: Locator

  constructor(page: Page) {
    this.page = page
    this.section = page.getByTestId("return-request")
    this.unavailable = page.getByTestId("return-request-unavailable").or(
      page.getByText(/iade edilebilir ürün yok/i)
    )
    this.open = page.getByTestId("return-request-open").or(
      page.getByRole("button", { name: /İade talebi oluştur/i })
    )
    this.form = page.getByTestId("return-request-form").or(
      page.locator("form").filter({ has: page.locator("#return-reason") })
    )
    this.reason = page.getByTestId("return-reason").or(page.locator("#return-reason"))
    this.note = page.getByTestId("return-note").or(page.locator("#return-note"))
    this.submit = page.getByTestId("return-request-submit").or(
      page.getByRole("button", { name: /Talebi gönder/i })
    )
    this.success = page
      .getByTestId("return-request-success")
      .or(page.getByRole("heading", { name: /İade talebi alındı/i }))
    this.returnId = page.getByTestId("return-request-id")
    this.address = page.getByTestId("return-request-address").or(
      page.getByText(/Bakırköy\/İstanbul/i)
    )
    this.qtyInputs = page
      .locator('[data-testid^="return-qty-"]')
      .or(page.locator('input[id^="ret-qty-"]'))
  }

  async isReturnable(): Promise<boolean> {
    return this.open.isVisible().catch(() => false)
  }

  async submitFirstItem(note = "E2E kargo takip: TEST123") {
    await this.open.click()
    await this.form.waitFor({ state: "visible", timeout: 15_000 })
    const qty = this.qtyInputs.first()
    await qty.fill("1")
    await this.reason.waitFor({ state: "visible", timeout: 15_000 })
    await this.page
      .locator("#return-reason option")
      .filter({ hasNotText: /Yükleniyor/ })
      .first()
      .waitFor({ state: "attached", timeout: 15_000 })
    const selected = await this.reason.inputValue()
    if (!selected) {
      const options = this.reason.locator("option")
      const count = await options.count()
      for (let i = 0; i < count; i++) {
        const value = await options.nth(i).getAttribute("value")
        if (value) {
          await this.reason.selectOption(value)
          break
        }
      }
    }
    await this.note.fill(note)
    await this.submit.click()
  }
}
