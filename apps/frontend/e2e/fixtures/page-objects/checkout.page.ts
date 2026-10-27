import type { Page, Locator } from "@playwright/test"
import { expect } from "@playwright/test"
import {
  dismissOverlays,
  skipSiteOverlays,
  waitForPageLoaderGone,
} from "../../utils/wait"

/** Mahalle listesi il seçilince /tr-mahalle/<il>.json'dan yüklenir. */
async function selectNeighbourhood(select: Locator, label: string) {
  await expect(select).toBeEnabled()
  await select.selectOption({ label })
}

export class CheckoutPage {
  readonly page: Page
  readonly email: Locator
  readonly firstName: Locator
  readonly lastName: Locator
  readonly address: Locator
  readonly city: Locator
  readonly district: Locator
  readonly neighbourhood: Locator
  readonly postal: Locator
  readonly phone: Locator
  readonly invoiceIndividual: Locator
  readonly invoiceCorporate: Locator
  readonly tckn: Locator
  readonly companyName: Locator
  readonly vkn: Locator
  readonly taxOffice: Locator
  readonly differentBilling: Locator
  readonly billingFields: Locator
  readonly legal: Locator
  readonly submit: Locator
  readonly form: Locator
  readonly alert: Locator
  readonly alertMessage: Locator
  readonly empty: Locator

  constructor(page: Page) {
    this.page = page
    this.email = page.getByTestId("checkout-email")
    this.firstName = page
      .getByTestId("checkout-first-name")
      .or(page.getByRole("textbox", { name: "Ad", exact: true }))
    this.lastName = page
      .getByTestId("checkout-last-name")
      .or(page.getByRole("textbox", { name: "Soyad" }))
    this.address = page
      .getByTestId("checkout-address")
      .or(page.getByRole("textbox", { name: "Adres", exact: true }))
    this.city = page
      .getByTestId("checkout-city")
      .or(
        page
          .locator("label.checkout-field")
          .filter({ hasText: /^İl(?!çe)/ })
          .locator("select")
      )
    this.district = page
      .getByTestId("checkout-district")
      .or(page.getByRole("combobox", { name: "İlçe" }))
    this.neighbourhood = page
      .getByTestId("checkout-neighbourhood")
      .or(page.getByRole("combobox", { name: "Mahalle" }))
    this.postal = page
      .getByTestId("checkout-postal")
      .or(page.getByRole("textbox", { name: "Posta kodu" }))
    this.phone = page
      .getByTestId("checkout-phone")
      .or(page.getByRole("textbox", { name: "Telefon" }))
    this.invoiceIndividual = page.getByTestId("checkout-invoice-individual")
    this.invoiceCorporate = page.getByTestId("checkout-invoice-corporate")
    this.tckn = page.getByTestId("checkout-tckn")
    this.companyName = page.getByTestId("checkout-company-name")
    this.vkn = page.getByTestId("checkout-vkn")
    this.taxOffice = page.getByTestId("checkout-tax-office")
    this.differentBilling = page.getByTestId("checkout-different-billing")
    this.billingFields = page.getByTestId("checkout-billing-fields")
    this.legal = page.getByTestId("checkout-legal")
    this.submit = page.getByTestId("checkout-submit")
    this.form = page.locator(".checkout-form, .checkout-main")
    this.alert = page
      .getByTestId("checkout-alert")
      .or(page.getByRole("alertdialog"))
    this.alertMessage = page
      .getByTestId("checkout-alert-message")
      .or(page.locator(".checkout-alert__message"))
    this.empty = page.getByTestId("checkout-empty").or(page.locator(".checkout-empty"))
  }

  async goto() {
    await skipSiteOverlays(this.page)
    await this.page.goto("/odeme", { waitUntil: "domcontentloaded" })
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
  }

  async fillGuestAddress(
    email: string,
    opts: { skipEmail?: boolean; acceptLegal?: boolean } = {}
  ) {
    if (!opts.skipEmail) {
      const enabled = await this.email.isEnabled().catch(() => true)
      if (enabled) {
        await this.email.fill(email)
      }
    }
    if (await this.firstName.count()) {
      await this.firstName.fill("Staging")
      await this.lastName.fill("E2E")
      await this.address.fill("Test Cad. No:1")
      await this.city.selectOption({ label: "İstanbul" })
      await this.district.selectOption({ label: "Şişli" })
      await selectNeighbourhood(this.neighbourhood, "Bozkurt Mahallesi")
      await this.postal.fill("34380")
      await this.phone.fill("05551112233")
    } else {
      await this.page.getByRole("textbox", { name: "Ad", exact: true }).fill("Staging")
      await this.page.getByRole("textbox", { name: "Soyad" }).fill("E2E")
      await this.page.getByRole("textbox", { name: "Adres" }).fill("Test Cad. No:1")
      const citySelect = this.page
        .locator("label.checkout-field")
        .filter({ hasText: /^İl(?!çe)/ })
        .locator("select")
      await citySelect.selectOption({ label: "İstanbul" })
      await this.page.getByRole("combobox", { name: "İlçe" }).selectOption({ label: "Şişli" })
      await selectNeighbourhood(
        this.page.getByRole("combobox", { name: "Mahalle" }),
        "Bozkurt Mahallesi"
      )
      await this.page.getByRole("textbox", { name: "Posta kodu" }).fill("34380")
      await this.page.getByRole("textbox", { name: "Telefon" }).fill("05551112233")
    }
    if (opts.acceptLegal !== false) {
      await this.legal.check()
    }
  }

  async fillBillingAddress(opts?: {
    first?: string
    last?: string
    address?: string
    city?: string
    district?: string
    neighbourhood?: string
    postal?: string
    phone?: string
  }) {
    await this.page.getByTestId("checkout-billing-first-name").fill(
      opts?.first ?? "Fatura"
    )
    await this.page.getByTestId("checkout-billing-last-name").fill(
      opts?.last ?? "Adresi"
    )
    await this.page.getByTestId("checkout-billing-address").fill(
      opts?.address ?? "Fatura Sk. No:2"
    )
    await this.page
      .getByTestId("checkout-billing-city")
      .selectOption({ label: opts?.city ?? "Ankara" })
    await this.page
      .getByTestId("checkout-billing-district")
      .selectOption({ label: opts?.district ?? "Çankaya" })
    await selectNeighbourhood(
      this.page.getByTestId("checkout-billing-neighbourhood"),
      opts?.neighbourhood ?? "Ahlatlıbel Mahallesi"
    )
    await this.page
      .getByTestId("checkout-billing-postal")
      .fill(opts?.postal ?? "06680")
    await this.page
      .getByTestId("checkout-billing-phone")
      .fill(opts?.phone ?? "05552223344")
  }

  async selectFirstShippingIfPresent() {
    const ship = this.page.locator('input[name="ship"]').first()
    if (await ship.count()) {
      await ship.check({ force: true })
    }
  }

  async submitForm() {
    await waitForPageLoaderGone(this.page)
    await dismissOverlays(this.page)
    await this.submit.click()
  }

  async expectAlert(message: string | RegExp) {
    await expect(this.alert).toBeVisible({ timeout: 10_000 })
    await expect(this.alertMessage).toContainText(message)
    await expect(this.page).toHaveURL(/\/odeme\/?$/)
  }

  async dismissAlert() {
    if (await this.alert.isVisible().catch(() => false)) {
      await this.alert.getByRole("button", { name: "Tamam" }).click()
      await expect(this.alert).toBeHidden({ timeout: 5_000 })
    }
  }

  async submitAndWaitForConfirmation() {
    await this.submitForm()
    await this.page.waitForURL(/\/odeme\/confirmation\//, {
      timeout: 60_000,
    })
  }

  async submitAndWaitForPaymentOrConfirmation() {
    await this.submitForm()
    await this.page.waitForURL(/\/odeme\/(payment|confirmation)\//, {
      timeout: 60_000,
    })
  }
}
