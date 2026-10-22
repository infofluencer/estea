"use server"

import { authHeaders } from "@/lib/auth/session"
import { sdk } from "@/lib/medusa"
import type {
  ReturnReason,
  ReturnRequestResult,
} from "@/components/order/order-types"

export type CreateReturnInput = {
  order_id: string
  /** Değişimde her kalem için yeni varyant (aynı ürün, başka beden/renk) */
  items: { id: string; quantity: number; exchange_variant_id?: string }[]
  reason_id: string
  note?: string
  /** Guest only — must match order email */
  email?: string
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; statusText?: string }
    if (typeof e.message === "string" && e.message.trim()) {
      if (/rate_limit|too many|429/i.test(e.message)) {
        return "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin."
      }
      if (/not found|404/i.test(e.message)) {
        return "Sipariş bulunamadı, bilgileri kontrol edin."
      }
      return e.message
    }
  }
  return "İade talebi oluşturulamadı. Lütfen tekrar deneyin."
}

export async function listReturnReasonsAction(): Promise<ReturnReason[]> {
  try {
    const res = await sdk.client.fetch<{
      return_reasons?: ReturnReason[]
    }>("/store/return-reasons", {
      method: "GET",
      query: { limit: 50 },
    })
    return res.return_reasons || []
  } catch {
    return []
  }
}

export async function createReturnRequestAction(
  input: CreateReturnInput
): Promise<
  { ok: true; return: ReturnRequestResult } | { ok: false; message: string }
> {
  const orderId = input.order_id?.trim()
  const reasonId = input.reason_id?.trim()
  const items = (input.items || [])
    .filter((i) => i.id && i.quantity >= 1)
    .map((i) => ({
      id: i.id,
      quantity: i.quantity,
      ...(i.exchange_variant_id ? { exchange_variant_id: i.exchange_variant_id } : {}),
    }))
  const note = input.note?.trim() || undefined
  const email = input.email?.trim()

  if (!orderId || !reasonId || items.length === 0) {
    return {
      ok: false,
      message: "Ürün, adet ve iade sebebi seçilmelidir.",
    }
  }

  try {
    if (email) {
      const res = await sdk.client.fetch<{ return: ReturnRequestResult }>(
        `/store/returns/guest`,
        {
          method: "POST",
          body: {
            order_id: orderId,
            email,
            items,
            reason_id: reasonId,
            note: note || null,
          },
        }
      )
      if (!res?.return?.id) {
        return { ok: false, message: "İade talebi oluşturulamadı." }
      }
      return { ok: true, return: res.return }
    }

    const headers = await authHeaders()
    if (!headers) {
      return {
        ok: false,
        message: "İade için giriş yapmanız veya e-posta doğrulaması gerekir.",
      }
    }

    const res = await sdk.client.fetch<{ return: ReturnRequestResult }>(
      `/store/returns/request`,
      {
        method: "POST",
        headers,
        body: {
          order_id: orderId,
          items,
          reason_id: reasonId,
          note: note || null,
        },
      }
    )
    if (!res?.return?.id) {
      return { ok: false, message: "İade talebi oluşturulamadı." }
    }
    return { ok: true, return: res.return }
  } catch (err) {
    return { ok: false, message: errorMessage(err) }
  }
}

export type ExchangeOptionItem = {
  item_id: string
  title: string
  variant: string | null
  choices: { variant_id: string; title: string; in_stock: boolean }[]
}

/** Değişim seçenekleri: her sipariş kalemi için aynı ürünün diğer beden/renkleri. */
export async function listExchangeOptionsAction(input: {
  order_id: string
  email?: string
}): Promise<ExchangeOptionItem[]> {
  try {
    const headers = input.email ? undefined : (await authHeaders()) || undefined
    const res = await sdk.client.fetch<{ items?: ExchangeOptionItem[] }>(
      "/store/returns/exchange-options",
      {
        method: "POST",
        headers,
        body: { order_id: input.order_id, email: input.email || null },
      }
    )
    return res.items || []
  } catch {
    return []
  }
}
