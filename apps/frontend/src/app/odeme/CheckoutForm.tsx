"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { readConsent } from "@/lib/consent"
import Link from "next/link"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { CheckoutAlertDialog } from "@/components/checkout/CheckoutAlertDialog"
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary"
import { formatTry } from "@/lib/medusa"
import {
  applyShippingOptionAction,
  completeCheckoutAction,
  getCheckoutSummaryAction,
  initiateBankTransferAction,
  initiatePaytrAction,
  listShippingOptionsAction,
  saveCheckoutContactAction,
} from "@/lib/checkout-actions"
import { NeighbourhoodSelect } from "@/components/checkout/NeighbourhoodSelect"
import type { BankTransferInfo, CheckoutPaymentMethod } from "@/lib/payment"
import { trCityCodeForName } from "@escay/shared/tr-address"
import {
  listTrDistricts,
  isAddressLineSuspicious,
  validateCheckoutAddress,
  type CheckoutAddressField,
  type CheckoutInvoiceType,
  type TrCityOption,
} from "@/lib/checkout-address"

type FormField =
  | "email"
  | CheckoutAddressField
  | "shipping"
  | "legal"
  | "billing_first_name"
  | "billing_last_name"
  | "billing_address_1"
  | "billing_city"
  | "billing_district"
  | "billing_neighbourhood"
  | "billing_postal_code"
  | "billing_phone"

type FormValidationError = {
  message: string
  field: FormField
}

type CartItem = {
  id: string
  title: string
  quantity: number
  unit_price?: number | null
  subtotal?: number | null
  thumbnail?: string | null
  variant?: { title?: string | null } | null
}

type CartSummary = {
  id: string
  email?: string | null
  item_subtotal?: number | null
  subtotal?: number | null
  item_total?: number | null
  discount_total?: number | null
  original_item_total?: number | null
  shipping_total?: number | null
  total?: number | null
  promotions?: { id: string; code: string }[] | null
  items?: CartItem[] | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    postal_code?: string | null
    phone?: string | null
    country_code?: string | null
    metadata?: { district?: string | null; neighbourhood?: string | null } | null
  } | null
  shipping_methods?: { id: string; name?: string | null }[] | null
  metadata?: { order_note?: string | null } | null
}

type CustomerAddress = {
  id: string
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  country_code?: string | null
  address_name?: string | null
  metadata?: { district?: string | null; neighbourhood?: string | null } | null
}

/** Seçili ilin ilçeleri (il adı → plaka → liste). */
function districtsFor(cityName: string): string[] {
  return listTrDistricts(trCityCodeForName(cityName))
}

/** Kayıtlı ilçe seçili ile ait değilse (eski serbest metin) boşaltılır. */
function knownDistrict(cityName: string, district?: string | null): string {
  const d = (district || "").trim()
  return districtsFor(cityName).includes(d) ? d : ""
}

type Customer = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  addresses?: CustomerAddress[] | null
}

export function CheckoutForm({
  cart: initialCart,
  customer,
  cities,
  bankTransfer = null,
}: {
  cart: CartSummary
  customer: Customer | null
  cities: TrCityOption[]
  /** Havale / EFT açıksa banka bilgileri (backend BANK_TRANSFER_*). */
  bankTransfer?: BankTransferInfo | null
}) {
  const [pending, startTransition] = useTransition()
  const submitLockRef = useRef(false)
  const [submitLocked, setSubmitLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)
  const [fieldError, setFieldError] = useState<FormField | null>(null)
  // Şüpheli açık adres: müşteriye sorulur, onaylarsa aynı adresle bir daha sorulmaz.
  const [addressConfirm, setAddressConfirm] = useState<{
    message: string
    field: FormField
    key: string
  } | null>(null)
  const confirmedAddressKeyRef = useRef<string | null>(null)
  const [cart, setCart] = useState(initialCart)
  const [shipOptions, setShipOptions] = useState<
    { id: string; name: string; amount: number | null }[]
  >([])
  const [selectedShip, setSelectedShip] = useState("")
  const [savedAddressHint, setSavedAddressHint] = useState<string | null>(null)
  const [shippingLoading, setShippingLoading] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("card")
  const isBankTransfer = Boolean(bankTransfer) && paymentMethod === "bank_transfer"
  // KVKK: pazarlama izni varsayılan kapalı
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [orderNote, setOrderNote] = useState(
    typeof initialCart.metadata?.order_note === "string"
      ? initialCart.metadata.order_note
      : ""
  )
  const [invoiceType, setInvoiceType] =
    useState<CheckoutInvoiceType>("individual")
  const [companyName, setCompanyName] = useState("")
  const [vkn, setVkn] = useState("")
  const [tckn, setTckn] = useState("")
  const [taxOffice, setTaxOffice] = useState("")
  const [differentBilling, setDifferentBilling] = useState(false)
  const [billingAddr, setBillingAddr] = useState({
    first_name: "",
    last_name: "",
    address_1: "",
    city: "",
    district: "",
    neighbourhood: "",
    postal_code: "",
    phone: "",
    country_code: "tr",
  })

  const emailRef = useRef<HTMLInputElement>(null)
  const firstNameRef = useRef<HTMLInputElement>(null)
  const lastNameRef = useRef<HTMLInputElement>(null)
  const address1Ref = useRef<HTMLInputElement>(null)
  const cityRef = useRef<HTMLSelectElement>(null)
  const districtRef = useRef<HTMLSelectElement>(null)
  const neighbourhoodRef = useRef<HTMLSelectElement>(null)
  const postalRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const shippingRef = useRef<HTMLDivElement>(null)
  const legalRef = useRef<HTMLLabelElement>(null)
  const vknRef = useRef<HTMLInputElement>(null)
  const tcknRef = useRef<HTMLInputElement>(null)
  const taxOfficeRef = useRef<HTMLInputElement>(null)
  const companyNameRef = useRef<HTMLInputElement>(null)
  const billingFirstNameRef = useRef<HTMLInputElement>(null)
  const billingLastNameRef = useRef<HTMLInputElement>(null)
  const billingAddress1Ref = useRef<HTMLInputElement>(null)
  const billingCityRef = useRef<HTMLSelectElement>(null)
  const billingDistrictRef = useRef<HTMLSelectElement>(null)
  const billingNeighbourhoodRef = useRef<HTMLSelectElement>(null)
  const billingPostalRef = useRef<HTMLInputElement>(null)
  const billingPhoneRef = useRef<HTMLInputElement>(null)

  const savedAddresses = customer?.addresses || []
  const [email, setEmail] = useState(customer?.email || cart.email || "")
  const [addr, setAddr] = useState({
    first_name: cart.shipping_address?.first_name || customer?.first_name || "",
    last_name: cart.shipping_address?.last_name || customer?.last_name || "",
    address_1: cart.shipping_address?.address_1 || "",
    city: cart.shipping_address?.city || "",
    district: knownDistrict(
      cart.shipping_address?.city || "",
      cart.shipping_address?.metadata?.district
    ),
    neighbourhood:
      cart.shipping_address?.metadata?.neighbourhood ||
      cart.shipping_address?.address_2 ||
      "",
    postal_code: cart.shipping_address?.postal_code || "",
    phone: cart.shipping_address?.phone || "",
    country_code: "tr",
  })

  function pickSavedAddress(id: string) {
    const a = savedAddresses.find((x) => x.id === id)
    if (!a) return

    const district = knownDistrict(a.city || "", a.metadata?.district)
    const neighbourhood = a.metadata?.neighbourhood || a.address_2 || ""
    const missingDistrict = !district
    const missingNeighbourhood = !neighbourhood.trim()
    const missingPhone = !a.phone?.trim()

    setAddr({
      first_name: a.first_name || "",
      last_name: a.last_name || "",
      address_1: a.address_1 || "",
      city: a.city || "",
      district,
      neighbourhood,
      postal_code: a.postal_code || "",
      phone: a.phone || "",
      country_code: (a.country_code || "tr").toLowerCase(),
    })

    if (missingDistrict || missingNeighbourhood || missingPhone) {
      const parts: string[] = []
      if (missingDistrict) parts.push("ilçe")
      if (missingNeighbourhood) parts.push("mahalle")
      if (missingPhone) parts.push("telefon")
      setSavedAddressHint(
        `Kayıtlı adresinizde ${parts.join(", ")} eksik — lütfen listeden seçin.`
      )
    } else {
      setSavedAddressHint(null)
    }
  }

  function buildAddressPayload() {
    return {
      ...addr,
      country_code: addr.country_code,
      invoice_type: invoiceType,
      company_name: invoiceType === "corporate" ? companyName : undefined,
      vkn: invoiceType === "corporate" ? vkn : undefined,
      tckn: invoiceType === "individual" ? tckn : undefined,
      tax_office: invoiceType === "corporate" ? taxOffice : undefined,
    }
  }

  function validateContactForm(): FormValidationError | null {
    if (!email.trim() || !email.includes("@")) {
      return { message: "Geçerli bir email girin.", field: "email" }
    }
    const result = validateCheckoutAddress(buildAddressPayload())
    if (!result.ok) {
      return { message: result.message, field: result.field }
    }
    if (differentBilling) {
      const billingResult = validateCheckoutAddress({
        ...billingAddr,
        invoice_type: invoiceType,
        // Kimlik ana formdan; adres doğrulaması için corporate alanları taşı
        vkn: invoiceType === "corporate" ? vkn : undefined,
        tckn: invoiceType === "individual" ? tckn : undefined,
        tax_office: invoiceType === "corporate" ? taxOffice : undefined,
        company_name: invoiceType === "corporate" ? companyName : undefined,
      })
      if (!billingResult.ok) {
        const fieldMap: Partial<Record<CheckoutAddressField, FormField>> = {
          first_name: "billing_first_name",
          last_name: "billing_last_name",
          address_1: "billing_address_1",
          city: "billing_city",
          district: "billing_district",
          neighbourhood: "billing_neighbourhood",
          postal_code: "billing_postal_code",
          phone: "billing_phone",
        }
        const mapped = fieldMap[billingResult.field]
        return {
          message: `Fatura adresi: ${billingResult.message}`,
          field: mapped || billingResult.field,
        }
      }
    }
    return null
  }

  function focusField(field: FormField) {
    const map: Record<
      FormField,
      React.RefObject<HTMLElement | null> | undefined
    > = {
      email: emailRef,
      first_name: firstNameRef,
      last_name: lastNameRef,
      address_1: address1Ref,
      city: cityRef,
      district: districtRef,
      neighbourhood: neighbourhoodRef,
      postal_code: postalRef,
      phone: phoneRef,
      shipping: shippingRef,
      legal: legalRef,
      vkn: vknRef,
      tckn: tcknRef,
      tax_office: taxOfficeRef,
      company_name: companyNameRef,
      invoice_type: companyNameRef,
      billing_first_name: billingFirstNameRef,
      billing_last_name: billingLastNameRef,
      billing_address_1: billingAddress1Ref,
      billing_city: billingCityRef,
      billing_district: billingDistrictRef,
      billing_neighbourhood: billingNeighbourhoodRef,
      billing_postal_code: billingPostalRef,
      billing_phone: billingPhoneRef,
    }
    const el = map[field]?.current
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    if ("focus" in el && typeof el.focus === "function") {
      el.focus({ preventScroll: true })
    }
  }

  function showFormError(message: string, field?: FormField | null) {
    setError(message)
    setFieldError(field ?? null)
    setAlertOpen(true)
    if (field) {
      requestAnimationFrame(() => focusField(field))
    }
  }

  function clearFieldError(field: FormField) {
    setFieldError((current) => (current === field ? null : current))
  }

  function inputClass(field: FormField, extra = "") {
    return [
      "checkout-input",
      extra,
      fieldError === field ? "checkout-input--error" : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  async function syncShippingWithCart(
    options: { id: string; name: string; amount: number | null }[],
    currentCart: CartSummary
  ): Promise<CartSummary> {
    if (!options.length) return currentCart

    const preferredId = selectedShip || options[0].id
    const option = options.find((o) => o.id === preferredId) ?? options[0]
    setSelectedShip(option.id)

    const cartShipping = Number(currentCart.shipping_total ?? 0)
    const hasMethod = (currentCart.shipping_methods?.length ?? 0) > 0
    // Tutar bilinmiyorsa (hesaplanamadı) mevcut yöntemi yeniden uygulama;
    // backend uygularken ücreti zaten kendisi hesaplar.
    const needsApply =
      !hasMethod ||
      (option.amount != null &&
        Math.abs(cartShipping - Number(option.amount)) > 0.01)

    if (!needsApply) return currentCart

    const applyRes = await applyShippingOptionAction(option.id)
    if (!applyRes.ok) return currentCart

    const summary = await getCheckoutSummaryAction()
    if (summary) {
      setCart(summary)
      return summary
    }
    return currentCart
  }

  async function refreshShippingOptions() {
    const ships = await listShippingOptionsAction()
    if (!ships.ok) return ships
    setShipOptions(ships.options)

    if (ships.options.length) {
      const summary = await getCheckoutSummaryAction()
      if (summary) {
        await syncShippingWithCart(ships.options, summary)
      }
    }

    return ships
  }

  useEffect(() => {
    if (!cart.shipping_address?.city) return
    startTransition(async () => {
      setShippingLoading(true)
      await refreshShippingOptions()
      setShippingLoading(false)
    })
    // Only prefetch when cart already has an address from server
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const validationError = validateContactForm()
    if (validationError) return

    const timer = setTimeout(() => {
      startTransition(async () => {
        setShippingLoading(true)
        const res = await saveCheckoutContactAction({
          email,
          address: buildAddressPayload(),
          useDifferentBillingAddress: differentBilling,
          billingAddress: differentBilling ? billingAddr : undefined,
          marketingConsent,
          // Çerez banner'ı "Pazarlama" onayı → sipariş metadata (Meta Conversions API)
          trackingConsent: readConsent()?.marketing === true,
          orderNote,
        })
        if (!res.ok) {
          setShippingLoading(false)
          return
        }
        await refreshShippingOptions()
        setShippingLoading(false)
      })
    }, 700)

    return () => clearTimeout(timer)
  }, [
    email,
    marketingConsent,
    orderNote,
    addr.first_name,
    addr.last_name,
    addr.address_1,
    addr.city,
    addr.district,
    addr.neighbourhood,
    addr.postal_code,
    addr.phone,
    invoiceType,
    companyName,
    vkn,
    tckn,
    taxOffice,
    differentBilling,
    billingAddr.first_name,
    billingAddr.last_name,
    billingAddr.address_1,
    billingAddr.city,
    billingAddr.district,
    billingAddr.neighbourhood,
    billingAddr.postal_code,
    billingAddr.phone,
  ])

  function onContinueToPayment(e: React.FormEvent) {
    e.preventDefault()
    if (submitLockRef.current || pending || submitLocked) return
    setError(null)
    setFieldError(null)
    setAlertOpen(false)

    const validationError = validateContactForm()
    if (validationError) {
      showFormError(validationError.message, validationError.field)
      return
    }
    if (shipOptions.length && !selectedShip) {
      showFormError("Kargo seçin.", "shipping")
      return
    }
    if (!legalAccepted) {
      showFormError(
        "Devam etmek için mesafeli satış sözleşmesi ve ön bilgilendirme formunu onaylayın.",
        "legal"
      )
      return
    }

    const suspicious = findSuspiciousAddress()
    if (suspicious && confirmedAddressKeyRef.current !== suspicious.key) {
      setAddressConfirm(suspicious)
      return
    }

    submitCheckout()
  }

  /** Numara veya sokak adı görünmeyen açık adres → engel değil, onay sorusu. */
  function findSuspiciousAddress(): {
    message: string
    field: FormField
    key: string
  } | null {
    const lines: { line: string; ctx: typeof addr; field: FormField; label: string }[] = [
      { line: addr.address_1, ctx: addr, field: "address_1", label: "Teslimat adresi" },
    ]
    if (differentBilling) {
      lines.push({
        line: billingAddr.address_1,
        ctx: billingAddr,
        field: "billing_address_1",
        label: "Fatura adresi",
      })
    }
    const hit = lines.find(({ line, ctx }) =>
      isAddressLineSuspicious(line, {
        neighbourhood: ctx.neighbourhood,
        district: ctx.district,
        city: ctx.city,
      })
    )
    if (!hit) return null
    return {
      field: hit.field,
      key: lines.map((l) => l.line.trim()).join("|"),
      message:
        `${hit.label}: "${hit.line.trim()}" — cadde/sokak veya bina-daire numarası göremedik. ` +
        "Kargonun ulaşması için açık adresin eksiksiz olması gerekir. Adresiniz doğruysa devam edebilirsiniz.",
    }
  }

  function submitCheckout() {
    submitLockRef.current = true
    setSubmitLocked(true)
    startTransition(async () => {
      let unlock = true
      try {
        const res = await saveCheckoutContactAction({
          email,
          address: buildAddressPayload(),
          useDifferentBillingAddress: differentBilling,
          billingAddress: differentBilling ? billingAddr : undefined,
          marketingConsent,
          // Çerez banner'ı "Pazarlama" onayı → sipariş metadata (Meta Conversions API)
          trackingConsent: readConsent()?.marketing === true,
          orderNote,
        })
        if (!res.ok) {
          showFormError(res.message, res.code === "email_domain" ? "email" : null)
          return
        }

        const ships = await refreshShippingOptions()
        if (!ships || !ships.ok) {
          showFormError(ships?.message ?? "Kargo seçenekleri alınamadı.")
          return
        }

        const optionId = selectedShip || ships.options[0]?.id
        if (!optionId) {
          showFormError("Kargo seçeneği bulunamadı.", "shipping")
          return
        }

        const shipRes = await applyShippingOptionAction(optionId)
        if (!shipRes.ok) {
          showFormError(shipRes.message, "shipping")
          return
        }

        const summary = await getCheckoutSummaryAction()
        if (summary) setCart(summary)

        let iframeToken: string | null = null
        if (isBankTransfer) {
          const bankRes = await initiateBankTransferAction()
          if (!bankRes.ok) {
            showFormError(bankRes.message)
            return
          }
        } else {
          const paytrRes = await initiatePaytrAction()
          if (!paytrRes.ok) {
            showFormError(paytrRes.message)
            return
          }
          iframeToken = paytrRes.iframeToken
        }

        const completeRes = await completeCheckoutAction({
          legalAcceptedAt: new Date().toISOString(),
          iframeToken,
          paymentMethod: isBankTransfer ? "bank_transfer" : "card",
        })
        if (!completeRes.ok) {
          showFormError(completeRes.message)
          return
        }

        // Token varsa action redirect() ile /checkout/payment/[token]'a gider.
        // Havale / stub / token yok — sipariş oluştu, onay sayfasına git (IBAN orada).
        unlock = false
        window.location.href = `/odeme/confirmation/${completeRes.orderId}`
      } finally {
        if (unlock) {
          submitLockRef.current = false
          setSubmitLocked(false)
        }
      }
    })
  }

  return (
    <>
      <CheckoutProgress current="address" />

      <CheckoutAlertDialog
        open={alertOpen && Boolean(error)}
        message={error || ""}
        onClose={() => {
          setAlertOpen(false)
          if (fieldError) {
            requestAnimationFrame(() => focusField(fieldError))
          }
        }}
      />

      <CheckoutAlertDialog
        open={Boolean(addressConfirm)}
        title="Adresinizi kontrol edin"
        message={addressConfirm?.message || ""}
        closeLabel="Adresi düzenle"
        confirmLabel="Adres doğru, devam et"
        onClose={() => {
          const field = addressConfirm?.field
          setAddressConfirm(null)
          if (field) requestAnimationFrame(() => focusField(field))
        }}
        onConfirm={() => {
          confirmedAddressKeyRef.current = addressConfirm?.key ?? null
          setAddressConfirm(null)
          submitCheckout()
        }}
      />

      <div className="checkout-layout">
        <div className="checkout-main">
          <h1 className="checkout-main__title">Adres</h1>

          {customer && (
            <p className="checkout-account">
              Giriş yapıldı: <strong>{customer.email}</strong>
            </p>
          )}

          <form
            onSubmit={onContinueToPayment}
            className="checkout-form"
            noValidate
          >
              <label className="checkout-field">
                <span className="checkout-label">E-posta (zorunlu)</span>
                <input
                  ref={emailRef}
                  data-testid="checkout-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearFieldError("email")
                  }}
                  className={inputClass("email")}
                  aria-invalid={fieldError === "email"}
                  disabled={Boolean(customer?.email)}
                />
              </label>

              <label className="checkout-legal">
                <input
                  type="checkbox"
                  data-testid="checkout-marketing-consent"
                  className="checkout-legal__input"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                />
                <span className="checkout-label checkout-legal__text">
                  Teklifler için bana e-posta gönderin
                </span>
              </label>

              {savedAddresses.length > 0 && (
                <label className="checkout-field">
                  <span className="checkout-label">Kayıtlı adres</span>
                  <select
                    defaultValue=""
                    onChange={(e) => pickSavedAddress(e.target.value)}
                    className="checkout-input checkout-select"
                  >
                    <option value="">Yeni adres gir</option>
                    {savedAddresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.address_name || a.address_1} — {a.city}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {savedAddressHint && (
                <p className="checkout-hint" role="status">
                  {savedAddressHint}
                </p>
              )}

              <div className="checkout-form__row">
                <label className="checkout-field">
                  <span className="checkout-label">Ad</span>
                  <input
                    ref={firstNameRef}
                    data-testid="checkout-first-name"
                    placeholder="Ad"
                    value={addr.first_name}
                    onChange={(e) => {
                      setAddr({ ...addr, first_name: e.target.value })
                      clearFieldError("first_name")
                    }}
                    className={inputClass("first_name")}
                    aria-invalid={fieldError === "first_name"}
                  />
                </label>
                <label className="checkout-field">
                  <span className="checkout-label">Soyad</span>
                  <input
                    ref={lastNameRef}
                    data-testid="checkout-last-name"
                    placeholder="Soyad"
                    value={addr.last_name}
                    onChange={(e) => {
                      setAddr({ ...addr, last_name: e.target.value })
                      clearFieldError("last_name")
                    }}
                    className={inputClass("last_name")}
                    aria-invalid={fieldError === "last_name"}
                  />
                </label>
              </div>

              <div className="checkout-form__row">
                <label className="checkout-field">
                  <span className="checkout-label">İl (zorunlu)</span>
                  <select
                    ref={cityRef}
                    data-testid="checkout-city"
                    value={addr.city}
                    onChange={(e) => {
                      setAddr({
                        ...addr,
                        city: e.target.value,
                        district: "",
                        neighbourhood: "",
                      })
                      setSavedAddressHint(null)
                      clearFieldError("city")
                    }}
                    className={inputClass("city", "checkout-select")}
                    aria-invalid={fieldError === "city"}
                  >
                    <option value="">İl seçin</option>
                    {cities.map((c) => (
                      <option key={c.code} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkout-field">
                  <span className="checkout-label">İlçe</span>
                  <select
                    ref={districtRef}
                    data-testid="checkout-district"
                    value={addr.district}
                    disabled={!addr.city}
                    onChange={(e) => {
                      setAddr({
                        ...addr,
                        district: e.target.value,
                        neighbourhood: "",
                      })
                      setSavedAddressHint(null)
                      clearFieldError("district")
                    }}
                    className={inputClass("district", "checkout-select")}
                    aria-invalid={fieldError === "district"}
                  >
                    <option value="">
                      {addr.city ? "İlçe seçin" : "Önce il seçin"}
                    </option>
                    {districtsFor(addr.city).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="checkout-form__row">
                <label className="checkout-field">
                  <span className="checkout-label">Mahalle</span>
                  <NeighbourhoodSelect
                    selectRef={neighbourhoodRef}
                    testId="checkout-neighbourhood"
                    city={addr.city}
                    district={addr.district}
                    value={addr.neighbourhood}
                    onChange={(neighbourhood) => {
                      setAddr((a) => ({ ...a, neighbourhood }))
                      setSavedAddressHint(null)
                      clearFieldError("neighbourhood")
                    }}
                    className={inputClass("neighbourhood", "checkout-select")}
                    inputClassName={inputClass("neighbourhood")}
                    invalid={fieldError === "neighbourhood"}
                  />
                </label>
                <label className="checkout-field">
                  <span className="checkout-label">Posta kodu</span>
                  <input
                    ref={postalRef}
                    data-testid="checkout-postal"
                    placeholder="Posta kodu"
                    inputMode="numeric"
                    pattern="\d{5}"
                    maxLength={5}
                    value={addr.postal_code}
                    onChange={(e) => {
                      setAddr({ ...addr, postal_code: e.target.value })
                      clearFieldError("postal_code")
                    }}
                    className={inputClass("postal_code")}
                    aria-invalid={fieldError === "postal_code"}
                  />
                </label>
              </div>

              <label className="checkout-field">
                <span className="checkout-label">Adres</span>
                <input
                  ref={address1Ref}
                  data-testid="checkout-address"
                  placeholder="Cadde, sokak, bina no, daire"
                  value={addr.address_1}
                  onChange={(e) => {
                    setAddr({ ...addr, address_1: e.target.value })
                    clearFieldError("address_1")
                  }}
                  className={inputClass("address_1")}
                  aria-invalid={fieldError === "address_1"}
                />
              </label>

              <label className="checkout-field">
                <span className="checkout-label">Telefon</span>
                <input
                  ref={phoneRef}
                  data-testid="checkout-phone"
                  placeholder="Telefon"
                  type="tel"
                  autoComplete="tel"
                  value={addr.phone}
                  onChange={(e) => {
                    setAddr({ ...addr, phone: e.target.value })
                    setSavedAddressHint(null)
                    clearFieldError("phone")
                  }}
                  className={inputClass("phone")}
                  aria-invalid={fieldError === "phone"}
                />
              </label>

              <label className="checkout-field">
                <span className="checkout-label">Ülke</span>
                <input
                  value="Türkiye"
                  disabled
                  className="checkout-input checkout-input--disabled"
                />
              </label>

              <label className="checkout-field">
                <span className="checkout-label">Sipariş notu (opsiyonel)</span>
                <textarea
                  data-testid="checkout-order-note"
                  placeholder="Siparişinizle ilgili eklemek istediğiniz bir not varsa yazın"
                  rows={3}
                  maxLength={500}
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value)}
                  className="checkout-input checkout-textarea"
                />
              </label>

              <div className="checkout-invoice-section">
                <h2 className="checkout-section-title">Fatura Detayları</h2>

                <fieldset className="checkout-invoice-type">
                  <legend className="checkout-label">Fatura tipi</legend>
                  <div className="checkout-radio-row">
                    <label className="checkout-radio-option">
                      <input
                        type="radio"
                        name="invoice_type"
                        className="checkout-ship-radio"
                        data-testid="checkout-invoice-individual"
                        checked={invoiceType === "individual"}
                        onChange={() => {
                          setInvoiceType("individual")
                          clearFieldError("vkn")
                          clearFieldError("tax_office")
                          clearFieldError("company_name")
                        }}
                      />
                      <span>Bireysel</span>
                    </label>
                    <label className="checkout-radio-option">
                      <input
                        type="radio"
                        name="invoice_type"
                        className="checkout-ship-radio"
                        data-testid="checkout-invoice-corporate"
                        checked={invoiceType === "corporate"}
                        onChange={() => {
                          setInvoiceType("corporate")
                          clearFieldError("tckn")
                        }}
                      />
                      <span>Kurumsal</span>
                    </label>
                  </div>
                </fieldset>

                {invoiceType === "individual" ? (
                  <>
                    <label className="checkout-field">
                      <span className="checkout-label">
                        TCKN (opsiyonel)
                      </span>
                      <input
                        ref={tcknRef}
                        data-testid="checkout-tckn"
                        placeholder="11 haneli TCKN"
                        inputMode="numeric"
                        maxLength={11}
                        value={tckn}
                        onChange={(e) => {
                          setTckn(e.target.value.replace(/\D/g, "").slice(0, 11))
                          clearFieldError("tckn")
                        }}
                        className={inputClass("tckn")}
                        aria-invalid={fieldError === "tckn"}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="checkout-field">
                      <span className="checkout-label">Şirket unvanı</span>
                      <input
                        ref={companyNameRef}
                        data-testid="checkout-company-name"
                        placeholder="Şirket unvanı"
                        value={companyName}
                        onChange={(e) => {
                          setCompanyName(e.target.value)
                          clearFieldError("company_name")
                        }}
                        className={inputClass("company_name")}
                        aria-invalid={fieldError === "company_name"}
                      />
                    </label>
                    <div className="checkout-form__row">
                      <label className="checkout-field">
                        <span className="checkout-label">VKN</span>
                        <input
                          ref={vknRef}
                          data-testid="checkout-vkn"
                          placeholder="10 haneli VKN"
                          inputMode="numeric"
                          maxLength={10}
                          value={vkn}
                          onChange={(e) => {
                            setVkn(
                              e.target.value.replace(/\D/g, "").slice(0, 10)
                            )
                            clearFieldError("vkn")
                          }}
                          className={inputClass("vkn")}
                          aria-invalid={fieldError === "vkn"}
                        />
                      </label>
                      <label className="checkout-field">
                        <span className="checkout-label">Vergi dairesi</span>
                        <input
                          ref={taxOfficeRef}
                          data-testid="checkout-tax-office"
                          placeholder="Vergi dairesi"
                          value={taxOffice}
                          onChange={(e) => {
                            setTaxOffice(e.target.value)
                            clearFieldError("tax_office")
                          }}
                          className={inputClass("tax_office")}
                          aria-invalid={fieldError === "tax_office"}
                        />
                      </label>
                    </div>
                  </>
                )}

                <label className="checkout-legal checkout-billing-toggle">
                  <input
                    type="checkbox"
                    data-testid="checkout-different-billing"
                    className="checkout-legal__input"
                    checked={differentBilling}
                    onChange={(e) => {
                      setDifferentBilling(e.target.checked)
                      if (e.target.checked && !billingAddr.first_name) {
                        setBillingAddr({
                          first_name: addr.first_name,
                          last_name: addr.last_name,
                          address_1: "",
                          city: addr.city,
                          district: "",
                          neighbourhood: "",
                          postal_code: "",
                          phone: addr.phone,
                          country_code: "tr",
                        })
                      }
                    }}
                  />
                  <span className="checkout-label checkout-legal__text">
                    Fatura adresi teslimat adresinden farklı
                  </span>
                </label>

                {differentBilling ? (
                  <div
                    className="checkout-billing-fields"
                    data-testid="checkout-billing-fields"
                  >
                    <p className="checkout-muted">
                      Fatura adresi (teslimat adresinden farklı)
                    </p>
                    <div className="checkout-form__row">
                      <label className="checkout-field">
                        <span className="checkout-label">Ad</span>
                        <input
                          ref={billingFirstNameRef}
                          data-testid="checkout-billing-first-name"
                          value={billingAddr.first_name}
                          onChange={(e) => {
                            setBillingAddr({
                              ...billingAddr,
                              first_name: e.target.value,
                            })
                            clearFieldError("billing_first_name")
                          }}
                          className={inputClass("billing_first_name")}
                          aria-invalid={fieldError === "billing_first_name"}
                        />
                      </label>
                      <label className="checkout-field">
                        <span className="checkout-label">Soyad</span>
                        <input
                          ref={billingLastNameRef}
                          data-testid="checkout-billing-last-name"
                          value={billingAddr.last_name}
                          onChange={(e) => {
                            setBillingAddr({
                              ...billingAddr,
                              last_name: e.target.value,
                            })
                            clearFieldError("billing_last_name")
                          }}
                          className={inputClass("billing_last_name")}
                          aria-invalid={fieldError === "billing_last_name"}
                        />
                      </label>
                    </div>
                    <div className="checkout-form__row">
                      <label className="checkout-field">
                        <span className="checkout-label">İl</span>
                        <select
                          ref={billingCityRef}
                          data-testid="checkout-billing-city"
                          value={billingAddr.city}
                          onChange={(e) => {
                            setBillingAddr({
                              ...billingAddr,
                              city: e.target.value,
                              district: "",
                              neighbourhood: "",
                            })
                            clearFieldError("billing_city")
                          }}
                          className={inputClass("billing_city", "checkout-select")}
                          aria-invalid={fieldError === "billing_city"}
                        >
                          <option value="">İl seçin</option>
                          {cities.map((c) => (
                            <option key={c.code} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="checkout-field">
                        <span className="checkout-label">İlçe</span>
                        <select
                          ref={billingDistrictRef}
                          data-testid="checkout-billing-district"
                          value={billingAddr.district}
                          disabled={!billingAddr.city}
                          onChange={(e) => {
                            setBillingAddr({
                              ...billingAddr,
                              district: e.target.value,
                              neighbourhood: "",
                            })
                            clearFieldError("billing_district")
                          }}
                          className={inputClass("billing_district", "checkout-select")}
                          aria-invalid={fieldError === "billing_district"}
                        >
                          <option value="">
                            {billingAddr.city ? "İlçe seçin" : "Önce il seçin"}
                          </option>
                          {districtsFor(billingAddr.city).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="checkout-form__row">
                      <label className="checkout-field">
                        <span className="checkout-label">Mahalle</span>
                        <NeighbourhoodSelect
                          selectRef={billingNeighbourhoodRef}
                          testId="checkout-billing-neighbourhood"
                          city={billingAddr.city}
                          district={billingAddr.district}
                          value={billingAddr.neighbourhood}
                          onChange={(neighbourhood) => {
                            setBillingAddr((b) => ({ ...b, neighbourhood }))
                            clearFieldError("billing_neighbourhood")
                          }}
                          className={inputClass("billing_neighbourhood", "checkout-select")}
                          inputClassName={inputClass("billing_neighbourhood")}
                          invalid={fieldError === "billing_neighbourhood"}
                        />
                      </label>
                      <label className="checkout-field">
                        <span className="checkout-label">Posta kodu</span>
                        <input
                          ref={billingPostalRef}
                          data-testid="checkout-billing-postal"
                          inputMode="numeric"
                          maxLength={5}
                          value={billingAddr.postal_code}
                          onChange={(e) => {
                            setBillingAddr({
                              ...billingAddr,
                              postal_code: e.target.value,
                            })
                            clearFieldError("billing_postal_code")
                          }}
                          className={inputClass("billing_postal_code")}
                          aria-invalid={fieldError === "billing_postal_code"}
                        />
                      </label>
                    </div>
                    <label className="checkout-field">
                      <span className="checkout-label">Adres</span>
                      <input
                        ref={billingAddress1Ref}
                        data-testid="checkout-billing-address"
                        placeholder="Cadde, sokak, bina no, daire"
                        value={billingAddr.address_1}
                        onChange={(e) => {
                          setBillingAddr({
                            ...billingAddr,
                            address_1: e.target.value,
                          })
                          clearFieldError("billing_address_1")
                        }}
                        className={inputClass("billing_address_1")}
                        aria-invalid={fieldError === "billing_address_1"}
                      />
                    </label>
                    <label className="checkout-field">
                      <span className="checkout-label">Telefon</span>
                      <input
                        ref={billingPhoneRef}
                        data-testid="checkout-billing-phone"
                        type="tel"
                        value={billingAddr.phone}
                        onChange={(e) => {
                          setBillingAddr({
                            ...billingAddr,
                            phone: e.target.value,
                          })
                          clearFieldError("billing_phone")
                        }}
                        className={inputClass("billing_phone")}
                        aria-invalid={fieldError === "billing_phone"}
                      />
                    </label>
                  </div>
                ) : null}
              </div>

              <div
                ref={shippingRef}
                tabIndex={-1}
                className={`checkout-ship-section${
                  fieldError === "shipping" ? " checkout-ship-section--error" : ""
                }`}
              >
                <h2 className="checkout-section-title">Kargo</h2>
                {shippingLoading && !shipOptions.length ? (
                  <p className="checkout-muted">Kargo seçenekleri yükleniyor…</p>
                ) : null}
                {!shippingLoading &&
                  !shipOptions.length &&
                  validateContactForm() ? (
                  <p className="checkout-muted">
                    Kargo seçenekleri için adres bilgilerinizi tamamlayın.
                  </p>
                ) : null}
                {shipOptions.length > 0 ? (
                  <div className="checkout-ship-list">
                    {shipOptions.map((o) => (
                      <label key={o.id} className="checkout-ship-option">
                        <input
                          type="radio"
                          name="ship"
                          className="checkout-ship-radio"
                          checked={selectedShip === o.id}
                          onChange={() => {
                            setSelectedShip(o.id)
                            clearFieldError("shipping")
                          }}
                        />
                        <span className="checkout-ship-option__name">
                          {o.name}
                        </span>
                        <span className="checkout-ship-option__price">
                          {o.amount == null
                            ? "Hesaplanıyor…"
                            : o.amount > 0
                              ? formatTry(o.amount)
                              : "Ücretsiz"}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>

              {bankTransfer ? (
                <div className="checkout-ship-section" data-testid="checkout-payment-method">
                  <h2 className="checkout-section-title">Ödeme yöntemi</h2>
                  <div className="checkout-ship-list">
                    <label className="checkout-ship-option">
                      <input
                        type="radio"
                        name="payment_method"
                        className="checkout-ship-radio"
                        checked={paymentMethod === "card"}
                        onChange={() => setPaymentMethod("card")}
                      />
                      <span className="checkout-ship-option__name">
                        Kredi / banka kartı
                        <span className="checkout-pay-option__hint">
                          PayTR güvenli ödeme sayfasında
                        </span>
                      </span>
                      <span />
                    </label>
                    <label className="checkout-ship-option">
                      <input
                        type="radio"
                        name="payment_method"
                        data-testid="checkout-payment-bank-transfer"
                        className="checkout-ship-radio"
                        checked={paymentMethod === "bank_transfer"}
                        onChange={() => setPaymentMethod("bank_transfer")}
                      />
                      <span className="checkout-ship-option__name">
                        Havale / EFT
                        <span className="checkout-pay-option__hint">
                          IBAN bilgileri sipariş sonrası ekranda ve e-postada.
                          Ödeme hesabımıza geçince siparişiniz hazırlanır.
                        </span>
                      </span>
                      <span />
                    </label>
                  </div>
                </div>
              ) : null}

              <label
                ref={legalRef}
                tabIndex={-1}
                className={`checkout-legal${
                  fieldError === "legal" ? " checkout-legal--error" : ""
                }`}
              >
                <input
                  type="checkbox"
                  data-testid="checkout-legal"
                  className="checkout-legal__input"
                  checked={legalAccepted}
                  onChange={(e) => {
                    setLegalAccepted(e.target.checked)
                    clearFieldError("legal")
                  }}
                />
                <span className="checkout-label checkout-legal__text">
                  <Link href="/legal/mesafeli-satis-sozlesmesi" target="_blank">
                    Mesafeli Satış Sözleşmesi
                  </Link>
                  {" "}ve{" "}
                  <Link href="/legal/on-bilgilendirme-formu" target="_blank">
                    Ön Bilgilendirme Formu
                  </Link>
                  ’nu okudum, kabul ediyorum.
                </span>
              </label>

              <div className="checkout-form__actions">
                <button
                  type="submit"
                  data-testid="checkout-submit"
                  className="cart-cta cart-cta--primary"
                  disabled={pending || submitLocked}
                >
                  {pending
                    ? "İşleniyor…"
                    : isBankTransfer
                      ? "Siparişi tamamla"
                      : "Ödemeye geç"}
                </button>
              </div>
            </form>
        </div>

        <CheckoutOrderSummary
        cart={cart}
        shippingEstimate={
          shipOptions.find((o) => o.id === selectedShip)?.amount ??
          shipOptions[0]?.amount ??
          null
        }
        useAppliedShipping={
          (cart.shipping_total ?? 0) > 0 ||
          ((cart.shipping_methods?.length ?? 0) > 0)
        }
      />
      </div>
    </>
  )
}
