"use server"

import { sdk } from "@/lib/medusa"
import type { OrderDetailView } from "@/components/order/order-types"
import { parseOrderNumber } from "@escay/shared/order-number"

const NOT_FOUND = "Sipariş bulunamadı, bilgileri kontrol edin."

export async function lookupOrderAction(
  id: string,
  email: string
): Promise<{ ok: true; order: OrderDetailView } | { ok: false; message: string }> {
  const trimmedId = id.trim()
  const trimmedEmail = email.trim()

  if (!trimmedId || !trimmedEmail) {
    return {
      ok: false,
      message: "Sipariş numarası ve e-posta gerekli.",
    }
  }

  if (parseOrderNumber(trimmedId).kind === "invalid") {
    return { ok: false, message: NOT_FOUND }
  }

  try {
    const res = await sdk.client.fetch<{ order: OrderDetailView }>(
      `/store/orders/lookup`,
      {
        method: "POST",
        body: { id: trimmedId, email: trimmedEmail },
      }
    )
    if (!res?.order) {
      return { ok: false, message: NOT_FOUND }
    }
    return { ok: true, order: res.order }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/429|rate.?limit|too many/i.test(msg)) {
      return {
        ok: false,
        message: "Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.",
      }
    }
    return { ok: false, message: NOT_FOUND }
  }
}
