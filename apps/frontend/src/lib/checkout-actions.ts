"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  CHECKOUT_CART_FIELDS,
  authHeaders,
  getCheckoutCart,
  getLoggedInCustomer,
} from "./checkout"
import type { ActionResult } from "./auth/actions"
import {
  buildBillingInvoiceMetadata,
  validateCheckoutAddress,
  type CheckoutAddressInput,
} from "./checkout-address"
import { emailDomainAcceptsMail } from "./email-domain"
import { cartLineImage, variantLabel } from "@/components/cart/cart-utils"
import {
  CART_FIELDS,
  clearCartIdCookie,
  createCart,
  getCart,
  getCartId,
  setCartIdCookie,
  transferCartToCustomer,
} from "./cart"
import {
  LAST_ORDER_EMAIL_COOKIE,
  LAST_ORDER_ID_COOKIE,
  PAYTR_PAID_CART_COOKIE,
  LAST_ORDER_COOKIE_OPTIONS,
} from "./auth/constants"
import { getAuthToken } from "./auth/session"
import { sdk } from "./medusa"
import { isSafePaytrIframeToken } from "./paytr-iframe-token"
import {
  fetchBankTransferInfo,
  initiateBankTransferPayment,
  initiatePaytrPayment,
  type CheckoutPaymentMethod,
} from "./payment"
import {
  clearPendingCheckoutItems,
  getPendingCheckoutItems,
  setPendingCheckoutItems,
} from "./pending-checkout"

export type AddressInput = CheckoutAddressInput

export type { ActionResult }

function errMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === "string" && m.trim()) return m
  }
  return fallback
}

/** PayTR get-token için müşteri IP'si (proxy arkasında x-forwarded-for). */
async function clientIpForPaytr(): Promise<string | undefined> {
  const h = await headers()
  const forwarded = h.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  const realIp = h.get("x-real-ip")?.trim()
  return realIp || undefined
}

async function requireCartId() {
  const cartId = await getCartId()
  if (!cartId) throw new Error("Sepet bulunamadı. Önce ürün ekleyin.")
  return cartId
}

/**
 * Teslimat + fatura kimliği (+ opsiyonel ayrı fatura adresi) → cart.
 * billing_address.metadata anahtarları backend extractTaxNumber ile hizalı:
 *   vkn | tckn | tax_office | company_name | invoice_type
 */
const ORDER_NOTE_MAX = 500

export async function saveCheckoutContactAction(input: {
  email: string
  address: AddressInput
  /** true → billing_address ayrı; false/undefined → billing = shipping + fatura meta */
  useDifferentBillingAddress?: boolean
  billingAddress?: AddressInput
  /** Checkout'taki "Teklifler için bana e-posta gönderin" → cart.metadata (Omnisend) */
  marketingConsent?: boolean
  /** Çerez "Pazarlama" onayı → sunucu tarafı reklam ölçümü (Meta CAPI) izni */
  trackingConsent?: boolean
  /** Müşterinin sipariş notu → cart.metadata.order_note (siparişe taşınır, etikete basılır) */
  orderNote?: string
}): Promise<ActionResult> {
  try {
    const email = input.email.trim()
    if (!email || !email.includes("@")) {
      return { ok: false, message: "Geçerli bir email girin." }
    }
    if (!(await emailDomainAcceptsMail(email))) {
      const domain = email.split("@").pop()
      return {
        ok: false,
        code: "email_domain",
        message: `"${domain}" adında bir e-posta alan adı bulunamadı. Sipariş ve kargo bilgileri bu adrese ulaşamaz; lütfen e-posta adresinizi kontrol edin (ör. gmail.com).`,
      }
    }

    const validated = validateCheckoutAddress(input.address)
    if (!validated.ok) {
      return { ok: false, message: validated.message }
    }

    const cartId = await requireCartId()
    const headers = await authHeaders()
    const a = validated.normalized

    // Shipping: teslimat — fatura kimliği billing'e yazılır (ayrı adres varsa shipping'te yok)
    const shippingMeta: Record<string, string> = {
      district: a.district,
      neighbourhood: a.neighbourhood,
      city_code: a.city_code,
      // Kargo provider'ı: Medusa order.email provider'a gelmez — metadata yedeği
      email,
    }

    const shipping = {
      first_name: a.first_name,
      last_name: a.last_name,
      address_1: a.address_1,
      address_2: a.neighbourhood,
      city: a.city,
      postal_code: a.postal_code,
      country_code: a.country_code,
      phone: a.phone,
      metadata: shippingMeta,
    }

    let billing = shipping

    if (input.useDifferentBillingAddress) {
      if (!input.billingAddress) {
        return {
          ok: false,
          message: "Farklı fatura adresi için adres bilgilerini doldurun.",
        }
      }
      // Fatura kimliği billing adres formunda (invoice alanları billingAddress'te)
      const billingValidated = validateCheckoutAddress({
        ...input.billingAddress,
        invoice_type: a.invoice_type,
        vkn: a.vkn ?? input.billingAddress.vkn,
        tckn: a.tckn ?? input.billingAddress.tckn,
        tax_office: a.tax_office ?? input.billingAddress.tax_office,
        company_name: a.company_name ?? input.billingAddress.company_name,
      })
      if (!billingValidated.ok) {
        return { ok: false, message: billingValidated.message }
      }
      const b = billingValidated.normalized
      billing = {
        first_name: b.first_name,
        last_name: b.last_name,
        address_1: b.address_1,
        address_2: b.neighbourhood,
        city: b.city,
        postal_code: b.postal_code,
        country_code: b.country_code,
        phone: b.phone,
        metadata: buildBillingInvoiceMetadata(b, email),
      }
    } else {
        // Aynı adres: shipping klonu + fatura kimlik metadata (VKN/TCKN burada)
        billing = {
          ...shipping,
          metadata: buildBillingInvoiceMetadata(a, email),
        }
      }

      const current = await getCheckoutCart()
      const existingMeta =
        current && typeof current === "object" && "metadata" in current
          ? ((current as { metadata?: Record<string, unknown> | null })
              .metadata ?? {})
          : {}

      await sdk.store.cart.update(
        cartId,
        {
          email,
          shipping_address: shipping,
          billing_address: billing,
          metadata: {
            ...existingMeta,
            marketing_consent: input.marketingConsent === true,
            tracking_consent: input.trackingConsent === true,
            order_note: (input.orderNote ?? "").trim().slice(0, ORDER_NOTE_MAX) || null,
          },
        },
        { fields: CHECKOUT_CART_FIELDS },
        headers
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: errMessage(e, "Adres kaydedilemedi.") }
    }
  }

  export async function listShippingOptionsAction(): Promise<
    | { ok: true; options: { id: string; name: string; amount: number | null }[] }
    | { ok: false; message: string }
  > {
    try {
      const cartId = await requireCartId()
      const headers = await authHeaders()
      const { shipping_options } = await sdk.store.fulfillment.listCartOptions(
        { cart_id: cartId },
        headers
      )
      // "calculated" seçeneklerde (kargo fiyat listesi) tutar listede gelmeyebilir;
      // o zaman sepet için ayrıca hesaplatılır. Hata olursa null → yedek ücret gösterilir.
      const options = await Promise.all(
        (shipping_options || []).map(async (o) => {
          let amount: number | null = o.amount ?? null
          if (amount == null && (o as { price_type?: string }).price_type === "calculated") {
            try {
              const { shipping_option } = await sdk.store.fulfillment.calculate(
                o.id,
                { cart_id: cartId },
                {},
                headers
              )
              amount = shipping_option?.amount ?? null
            } catch {
              amount = null
            }
          }
          return { id: o.id, name: o.name, amount }
        })
      )
      return { ok: true, options }
    } catch (e) {
      return { ok: false, message: errMessage(e, "Kargo seçenekleri alınamadı.") }
    }
  }

  export async function applyShippingOptionAction(
    optionId: string
  ): Promise<ActionResult> {
    try {
      if (!optionId) return { ok: false, message: "Kargo seçin." }
      const cartId = await requireCartId()
      const headers = await authHeaders()
      await sdk.store.cart.addShippingMethod(
        cartId,
        { option_id: optionId },
        { fields: CHECKOUT_CART_FIELDS },
        headers
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: errMessage(e, "Kargo uygulanamadı.") }
    }
  }

  function promoErrorMessage(e: unknown): string {
    const raw = errMessage(e, "")
    const lower = raw.toLowerCase()
    if (
      /not found|invalid|expired|inactive|does not apply|ineligible|no promotion/i.test(
        lower
      ) ||
      /geçersiz|bulunamad|süresi/i.test(lower)
    ) {
      return "İndirim kodu geçersiz veya bu sepete uygulanamıyor."
    }
    if (raw) return raw
    return "İndirim kodu uygulanamadı."
  }

  export async function applyPromoCodeAction(
    code: string
  ): Promise<ActionResult> {
    const promo = code.trim()
    if (!promo) {
      return { ok: false, message: "İndirim kodu girin." }
    }
    try {
      const cartId = await requireCartId()
      const headers = await authHeaders()
      await sdk.store.cart.addPromotions(
        cartId,
        { promo_codes: [promo] },
        { fields: CHECKOUT_CART_FIELDS },
        headers
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: promoErrorMessage(e) }
    }
  }

  export async function removePromoCodeAction(
    code: string
  ): Promise<ActionResult> {
    const promo = code.trim()
    if (!promo) return { ok: false, message: "Kaldırılacak kod yok." }
    try {
      const cartId = await requireCartId()
      const headers = await authHeaders()
      await sdk.store.cart.removePromotions(
        cartId,
        { promo_codes: [promo] },
        { fields: CHECKOUT_CART_FIELDS },
        headers
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: errMessage(e, "İndirim kodu kaldırılamadı.") }
    }
  }

  export async function getCheckoutSummaryAction() {
    const cart = await getCheckoutCart()
    if (!cart) return null
    const promotions = (
      (cart as { promotions?: { id?: string; code?: string | null }[] })
        .promotions || []
    )
      .filter((p) => p.code)
      .map((p) => ({ id: p.id || String(p.code), code: String(p.code) }))

    return {
      id: cart.id,
      email: cart.email,
      item_subtotal: cart.item_subtotal,
      subtotal: cart.subtotal,
      item_total: cart.item_total,
      discount_total: (cart as { discount_total?: number | null }).discount_total,
      shipping_total: cart.shipping_total,
      total: cart.total,
      original_item_total: (
        cart as { original_item_total?: number | null }
      ).original_item_total,
      promotions,
      items: (cart.items || []).map((i) => {
        const color = variantLabel(i) || i.variant?.title || null
        return {
          id: i.id,
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unit_price,
          subtotal: i.subtotal,
          thumbnail: cartLineImage(i),
          variant: color ? { title: color } : null,
        }
      }),
      shipping_address: cart.shipping_address,
      shipping_methods: cart.shipping_methods,
    }
  }

  /**
   * PayTR iFrame oturumu başlat — payment adımına geçilirken çağrılır.
   * Dönen iframeToken ile storefront iFrame URL oluşturulur.
   */
  export async function initiatePaytrAction(): Promise<
    | { ok: true; iframeToken: string | null; sessionId?: string }
    | { ok: false; message: string }
  > {
    try {
      const cart = await getCheckoutCart()
      if (!cart) return { ok: false, message: "Sepet bulunamadı." }
      const headers = await authHeaders()
      const userIp = await clientIpForPaytr()
      const result = await initiatePaytrPayment(
        {
          id: cart.id,
          payment_collection: cart.payment_collection,
          email: cart.email,
          items: cart.items,
          shipping_total: cart.shipping_total,
          shipping_address: cart.shipping_address,
          total: cart.total,
        },
        headers,
        userIp
      )
      return { ok: true, iframeToken: result.iframeToken ?? null, sessionId: result.sessionId }
    } catch (e) {
      return { ok: false, message: errMessage(e, "PayTR oturumu başlatılamadı.") }
    }
  }

  /**
   * Havale / EFT ödeme oturumu — payment adımında PayTR yerine çağrılır.
   * Seçenek kapalıysa (backend BANK_TRANSFER_*) reddedilir.
   */
  export async function initiateBankTransferAction(): Promise<
    { ok: true } | { ok: false; message: string }
  > {
    try {
      if (!(await fetchBankTransferInfo())) {
        return { ok: false, message: "Havale / EFT ile ödeme şu an kullanılamıyor." }
      }
      const cart = await getCheckoutCart()
      if (!cart) return { ok: false, message: "Sepet bulunamadı." }
      const headers = await authHeaders()
      await initiateBankTransferPayment(
        { id: cart.id, payment_collection: cart.payment_collection },
        headers
      )
      return { ok: true }
    } catch (e) {
      return { ok: false, message: errMessage(e, "Havale ödemesi başlatılamadı.") }
    }
  }

  /**
   * Ödeme adımına geçiş.
   *
   * Kart (iframeToken var): sipariş OLUŞTURULMAZ, sepet açık kalır. Ödeme denemesi
   * backend'e kaydedilir ve iframe'e gidilir; sipariş PayTR başarılı bildirince backend'de
   * oluşur (docs/ESCAY-KARARLAR.md K11). Başarısız ödemede müşteri aynı sepetle tekrar dener.
   *
   * Havale / stub (iframeToken yok): Medusa cart.complete hemen sipariş oluşturur; sepet
   * cookie'si silinir, yeniden deneme için line item snapshot'ı yazılır.
   *
   * iframeToken varsa redirect() — /checkout remount olmasın diye client push yok.
   */
  export async function completeCheckoutAction(input?: {
    legalAcceptedAt?: string
    iframeToken?: string | null
    /** order.metadata.payment_method — havale siparişi admin/mail/fatura için */
    paymentMethod?: CheckoutPaymentMethod
  }): Promise<
    | { ok: true; orderId: string }
    | { ok: false; message: string }
  > {
    const paytrToken =
      input?.paymentMethod !== "bank_transfer" && isSafePaytrIframeToken(input?.iframeToken)
        ? input.iframeToken
        : null
    let orderId = ""
    try {
      const cartId = await requireCartId()
      const cart = await getCheckoutCart()
      const headers = await authHeaders()

      const legalAcceptedAt =
        input?.legalAcceptedAt?.trim() || new Date().toISOString()

      const existingMeta =
        cart && typeof cart === "object" && "metadata" in cart
          ? ((cart as { metadata?: Record<string, unknown> | null }).metadata ??
            {})
          : {}

      await sdk.store.cart.update(
        cartId,
        {
          metadata: {
            ...existingMeta,
            legal_accepted_at: legalAcceptedAt,
            payment_method: input?.paymentMethod ?? "card",
          },
        },
        { fields: CHECKOUT_CART_FIELDS },
        headers
      )

      if (paytrToken) {
        // Kayıt yazılamazsa iframe açılmaz: para çekilip sahipsiz kalmasın. Kayıt,
        // müşteriye gösterilecek token'ın oturumuna yazılır; sepetin oturumu değişmişse
        // (ikinci sekme) backend 409 döner, müşteri ödemeye yeniden geçer.
        try {
          await sdk.client.fetch("/store/paytr-checkout/register", {
            method: "POST",
            body: { cart_id: cartId, iframe_token: paytrToken },
            headers,
          })
        } catch (e) {
          const status = (e as { status?: number } | null)?.status
          if (status === 409) {
            return {
              ok: false,
              message:
                "Ödeme ekranı yenilenmiş görünüyor (başka bir sekme açılmış olabilir). Lütfen ödemeye yeniden geçin.",
            }
          }
          throw e
        }
        await clearPendingCheckoutItems()
      } else {
      const pendingItems = (cart?.items || [])
        .map((i) => {
          const variantId =
            i && typeof i === "object" && "variant_id" in i
              ? (i as { variant_id?: string | null }).variant_id
              : (i as { variant?: { id?: string | null } | null }).variant?.id
          return {
            variant_id: variantId || "",
            quantity: Number(i.quantity) || 0,
          }
        })
        .filter((i) => i.variant_id && i.quantity > 0)

      const result = await sdk.store.cart.complete(
        cartId,
        { fields: "+order.id,+order.email" },
        headers
      )

      const order = (result as { order?: { id?: string; email?: string | null } }).order
      if (!order?.id) {
        return { ok: false, message: "Sipariş oluşturulamadı." }
      }

      const email = order.email || cart?.email || ""
      const jar = await cookies()
      if (email) {
        jar.set(LAST_ORDER_EMAIL_COOKIE, email, LAST_ORDER_COOKIE_OPTIONS)
      }
      jar.set(LAST_ORDER_ID_COOKIE, order.id, LAST_ORDER_COOKIE_OPTIONS)

      // Snapshot BEFORE clearing cart — fail/abandon restore path
      if (pendingItems.length) {
        await setPendingCheckoutItems(pendingItems)
      }

      // Completed cart cannot accept new line items — drop cookie now.
      // Snapshot is cleared only on payment success (finalizePaidCheckoutSession).
      await clearCartIdCookie()

      orderId = order.id
    }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Sipariş tamamlanamadı.") }
  }

  // Cookie yazımı bitti — redirect try/catch DIŞINDA (NEXT_REDIRECT yutulmasın).
  if (paytrToken) {
    redirect(`/odeme/payment/${paytrToken}`)
  }

  return { ok: true, orderId }
}

export type PaytrCheckoutPoll =
  | { state: "completed"; orderId: string }
  | { state: "processing" }
  /** Para alındı ama sipariş otomatik açılmayacak (elle inceleme / panelden iade) */
  | { state: "attention" }
  | { state: "unknown" }

/**
 * Ödeme sonuç sayfası: PayTR bildirimi işlendi mi? Sipariş oluştuysa onay sayfasının
 * okuduğu cookie'ler yazılır ve sepet bırakılır. Sepet çerezi bırakıldıktan sonra da
 * (bekleme süresi doldu, müşteri sonra döndü) ödenen sepet çerezi üzerinden sorulur.
 */
export async function pollPaytrCheckoutAction(oid: string): Promise<PaytrCheckoutPoll> {
  const jar = await cookies()
  const cartId = (await getCartId()) || jar.get(PAYTR_PAID_CART_COOKIE)?.value || null
  if (!oid || !cartId) return { state: "unknown" }
  try {
    const res = await sdk.client.fetch<{
      state: "completed" | "processing" | "attention" | "unknown"
      order_id?: string
      email?: string | null
    }>("/store/paytr-checkout/status", {
      method: "GET",
      query: { oid, cart_id: cartId },
    })
    if (res.state === "completed" && res.order_id) {
      if (res.email) jar.set(LAST_ORDER_EMAIL_COOKIE, res.email, LAST_ORDER_COOKIE_OPTIONS)
      jar.set(LAST_ORDER_ID_COOKIE, res.order_id, LAST_ORDER_COOKIE_OPTIONS)
      jar.delete(PAYTR_PAID_CART_COOKIE)
      await clearCartIdCookie()
      return { state: "completed", orderId: res.order_id }
    }
    if (res.state === "attention") return { state: "attention" }
    return { state: res.state === "processing" ? "processing" : "unknown" }
  } catch {
    // Bağlantı hatası: sonuç bilinmiyor, sayfa sormaya devam eder.
    return { state: "processing" }
  }
}

/**
 * PayTR success / onay sayfası — sepet + pending snapshot temizliği.
 * Ödenen sepet kimliği ayrı çerezde kalır ki geç gelen bildirim sonrası sayfa yenilenince
 * sipariş yine bulunabilsin (ödenmiş sepete ürün eklenmesin diye sepet çerezi gider).
 * Call only from a Server Action invocation (e.g. client mount), never RSC render.
 */
export async function finalizePaidCheckoutSession(): Promise<void> {
  const cartId = await getCartId()
  if (cartId) {
    const jar = await cookies()
    jar.set(PAYTR_PAID_CART_COOKIE, cartId, LAST_ORDER_COOKIE_OPTIONS)
  }
  await clearCartIdCookie()
  await clearPendingCheckoutItems()
}

/**
 * Ödeme fail / checkout boş: pending snapshot'tan yeni sepet kur.
 * Idempotent: aktif sepet zaten ürün içeriyorsa snapshot'ı temizleyip no-op.
 */
export async function restorePendingCheckoutCartAction(): Promise<
  | { ok: true; restored: boolean; cartId?: string }
  | { ok: false; message: string }
> {
  try {
    const pending = await getPendingCheckoutItems()
    if (!pending?.length) {
      return { ok: true, restored: false }
    }

    const existing = await getCart()
    if (existing?.id && (existing.items?.length ?? 0) > 0) {
      await clearPendingCheckoutItems()
      return { ok: true, restored: false, cartId: existing.id }
    }

    let cart = existing
    if (!cart?.id) {
      cart = await createCart()
      await setCartIdCookie(cart.id)
      const token = await getAuthToken()
      if (token) {
        await transferCartToCustomer(token)
        cart = (await getCart()) || cart
      }
    }

    if (!cart?.id) {
      return { ok: false, message: "Sepet oluşturulamadı." }
    }

    const token = await getAuthToken()
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined

    for (const item of pending) {
      try {
        await sdk.store.cart.createLineItem(
          cart.id,
          { variant_id: item.variant_id, quantity: item.quantity },
          { fields: CART_FIELDS },
          headers
        )
      } catch (e) {
        // Completed-cart race: recreate once
        const msg = errMessage(e, "")
        if (/already completed|completed/i.test(msg)) {
          await clearCartIdCookie()
          cart = await createCart()
          await setCartIdCookie(cart.id)
          await sdk.store.cart.createLineItem(
            cart.id,
            { variant_id: item.variant_id, quantity: item.quantity },
            { fields: CART_FIELDS },
            headers
          )
        } else {
          // Skip unavailable variants; keep restoring the rest
          continue
        }
      }
    }

    await clearPendingCheckoutItems()
    const refreshed = await getCart()
    return {
      ok: true,
      restored: true,
      cartId: refreshed?.id || cart.id,
    }
  } catch (e) {
    return {
      ok: false,
      message: errMessage(e, "Sepet geri yüklenemedi."),
    }
  }
}

export async function loadCheckoutBootstrap() {
  // Havale kapalı (2026-11-07): checkout'ta yalnız kart. Açmak için alttaki çağrıyı geri al.
  const [cart, customer] = await Promise.all([
    getCheckoutCart(),
    getLoggedInCustomer(),
    // fetchBankTransferInfo(),
  ])
  const bankTransfer = null
  return { cart, customer, bankTransfer }
}
