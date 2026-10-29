import { sdk } from "./medusa"

export const PAYTR_PAYMENT_PROVIDER_ID = "pp_paytr_paytr"
/** Havale / EFT — backend src/modules/bank-transfer */
export const BANK_TRANSFER_PAYMENT_PROVIDER_ID = "pp_havale_havale"

export type CheckoutPaymentMethod = "card" | "bank_transfer"

/** GET /store/bank-transfer — checkout'ta havale seçeneği + banka bilgileri. */
export type BankTransferInfo = {
  bank_name: string
  account_name: string
  iban: string
}

export async function fetchBankTransferInfo(): Promise<BankTransferInfo | null> {
  try {
    const res = await sdk.client.fetch<{ enabled: boolean } & Partial<BankTransferInfo>>(
      "/store/bank-transfer",
      { method: "GET" }
    )
    if (!res?.enabled || !res.iban || !res.account_name) return null
    return { bank_name: res.bank_name || "", account_name: res.account_name, iban: res.iban }
  } catch {
    return null
  }
}

/** Havale / EFT ödeme oturumu — sipariş ödeme bekler, admin onaylar. */
export async function initiateBankTransferPayment(
  cart: CartForPayment,
  headers?: Record<string, string>
) {
  return sdk.store.payment.initiatePaymentSession(
    cart as Parameters<typeof sdk.store.payment.initiatePaymentSession>[0],
    { provider_id: BANK_TRANSFER_PAYMENT_PROVIDER_ID },
    undefined,
    headers
  )
}

type CartForPayment = {
  id: string
  payment_collection?: { id?: string } | null
  email?: string | null
  shipping_total?: number | null
  items?: {
    id: string
    title: string
    quantity: number
    unit_price?: number | null
    variant?: { title?: string | null } | null
  }[] | null
  shipping_address?: {
    first_name?: string | null
    last_name?: string | null
    address_1?: string | null
    city?: string | null
    postal_code?: string | null
    phone?: string | null
  } | null
  total?: number | null
}

export type PaymentInitResult = {
  provider: "paytr" | "manual"
  iframeToken?: string | null
  sessionId?: string
}

/**
 * PayTR iFrame ödeme oturumu başlat.
 *
 * Dönen iframeToken ile storefront iFrame URL oluşturulur:
 *   https://www.paytr.com/odeme/guvenli/{iframeToken}
 *
 * userIp: tarayıcı tarafından sunucuya iletilmeli (X-Forwarded-For),
 * yoksa fallback değer kullanılır.
 */
export async function initiatePaytrPayment(
  cart: CartForPayment,
  headers?: Record<string, string>,
  userIp?: string
): Promise<PaymentInitResult> {
  const amountNum = Number(cart.total ?? 0)
  let cartItems = (cart.items || []).map((i) => ({
    name: `${i.title}${i.variant?.title ? ` — ${i.variant.title}` : ""}`,
    unit_price: i.unit_price || 0,
    quantity: i.quantity || 1,
  }))

  const shippingTotal = Number(cart.shipping_total || 0)
  if (shippingTotal > 0) {
    cartItems.push({
      name: "Kargo",
      unit_price: shippingTotal,
      quantity: 1,
    })
  }

  // PayTR basket sum must match payment_amount. After promotions, line
  // unit_prices are still pre-discount — collapse to one line at cart.total.
  const basketSum = cartItems.reduce(
    (sum, i) => sum + Number(i.unit_price || 0) * Number(i.quantity || 1),
    0
  )
  if (
    amountNum > 0 &&
    Math.abs(basketSum - amountNum) > 0.02
  ) {
    cartItems = [
      {
        name: "Sipariş",
        unit_price: amountNum,
        quantity: 1,
      },
    ]
  }

  const addr = cart.shipping_address
  const addressStr = [
    addr?.address_1,
    addr?.city,
    addr?.postal_code,
  ]
    .filter(Boolean)
    .join(", ")

  const result = await sdk.store.payment.initiatePaymentSession(
    cart as Parameters<typeof sdk.store.payment.initiatePaymentSession>[0],
    {
      provider_id: PAYTR_PAYMENT_PROVIDER_ID,
      data: {
        customer_email: cart.email || undefined,
        first_name: addr?.first_name || undefined,
        last_name: addr?.last_name || undefined,
        phone: addr?.phone || undefined,
        address: addressStr || "Türkiye",
        cart_items: cartItems,
        user_ip: userIp || undefined,
      },
    },
    undefined,
    headers
  )

  const sessionData = (result as {
    payment_collection?: {
      payment_sessions?: {
        data?: Record<string, unknown>
      }[]
    }
  })?.payment_collection?.payment_sessions?.[0]?.data

  return {
    provider: "paytr",
    iframeToken: (sessionData?.iframe_token as string | null) ?? null,
    sessionId: (sessionData?.session_id as string | undefined),
  }
}

