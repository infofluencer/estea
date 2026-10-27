import { bankTransferInfo, formatIban, isBankTransferOrder } from "../bank-transfer"
import { buildOrderConfirmationEmail } from "../../emails/order-confirmation"

const IBAN = "TR330006100519786457841326"

describe("bankTransferInfo", () => {
  it("bayrak kapalıyken null", () => {
    expect(bankTransferInfo({ BANK_TRANSFER_IBAN: IBAN, BANK_TRANSFER_ACCOUNT_NAME: "Es Çay" })).toBeNull()
  })

  it("IBAN veya hesap sahibi boşsa bayrak açık olsa da null", () => {
    expect(bankTransferInfo({ BANK_TRANSFER_ENABLED: "1", BANK_TRANSFER_ACCOUNT_NAME: "Es Çay" })).toBeNull()
    expect(bankTransferInfo({ BANK_TRANSFER_ENABLED: "1", BANK_TRANSFER_IBAN: IBAN })).toBeNull()
  })

  it("açık + tam → IBAN dörtlü gruplanır", () => {
    expect(
      bankTransferInfo({
        BANK_TRANSFER_ENABLED: "true",
        BANK_TRANSFER_BANK_NAME: " Ziraat Bankası ",
        BANK_TRANSFER_ACCOUNT_NAME: "Hamzalı Çay Gıda",
        BANK_TRANSFER_IBAN: "tr33 0006 1005 1978 6457 8413 26",
      })
    ).toEqual({
      bank_name: "Ziraat Bankası",
      account_name: "Hamzalı Çay Gıda",
      iban: "TR33 0006 1005 1978 6457 8413 26",
    })
  })

  it("formatIban", () => {
    expect(formatIban(IBAN)).toBe("TR33 0006 1005 1978 6457 8413 26")
  })

  it("isBankTransferOrder metadata.payment_method'a bakar", () => {
    expect(isBankTransferOrder({ metadata: { payment_method: "bank_transfer" } })).toBe(true)
    expect(isBankTransferOrder({ metadata: { payment_method: "card" } })).toBe(false)
    expect(isBankTransferOrder({ metadata: null })).toBe(false)
  })
})

describe("havale maili", () => {
  const base = {
    displayId: "100042",
    email: "a@escay.test",
    currencyCode: "try",
    items: [{ title: "Siyah Çay", quantity: 1, unit_price: 500 }],
    total: 6148.99,
  }

  it("bankTransfer varsa IBAN, tutar ve açıklama mailde", () => {
    const mail = buildOrderConfirmationEmail({
      ...base,
      bankTransfer: { bank_name: "Ziraat Bankası", account_name: "Es Çay", iban: formatIban(IBAN) },
    })
    expect(mail.subject).toBe("Ödemeniz Bekleniyor — #100042")
    expect(mail.html).toContain("TR33 0006 1005 1978 6457 8413 26")
    expect(mail.html).toContain("Sipariş no #100042")
    expect(mail.text).toContain("IBAN: TR33 0006 1005 1978 6457 8413 26")
    // Havalede kuruş yuvarlanmaz — müşteri tutarı birebir yazar
    expect(mail.text).toMatch(/Tutar: ₺6\.148,99/)
  })

  it("kart siparişinde mail değişmez", () => {
    const mail = buildOrderConfirmationEmail(base)
    expect(mail.subject).toBe("Siparişiniz Alındı — #100042")
    expect(mail.html).not.toContain("IBAN")
  })
})
