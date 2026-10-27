import { NextRequest, NextResponse } from "next/server"
import { getAuthToken } from "@/lib/auth/session"
import {
  CART_FIELDS,
  createCart,
  setCartIdCookie,
  transferCartToCustomer,
} from "@/lib/cart"
import { sdk } from "@/lib/medusa"

export const dynamic = "force-dynamic"

type RecoverCart = {
  id: string
  items?: { variant_id?: string | null; quantity?: number }[] | null
}

/**
 * Omnisend Abandoned Checkout linki (backend lib/omnisend.ts abandonedCheckoutUrl).
 * Kaynak sepetteki ürünlerle her zaman YENİ bir sepet açılır → /odeme.
 * Kaynak sepet id'si cookie'ye asla bağlanmaz: link imzasız olduğundan biri kendi
 * sepet id'siyle link gönderip kurbanın checkout'ta girdiği adres/TCKN'yi o sepetten
 * okuyabilirdi (store cart API id'yi bilen herkese açık).
 * Bulunamadı / boş → /sepet
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cartId: string }> }
) {
  const { cartId } = await params
  // Göreli Location: standalone'da req.nextUrl host'u 0.0.0.0:3025 (container) olur
  const to = (pathname: string) =>
    new NextResponse(null, { status: 307, headers: { Location: pathname } })

  let source: RecoverCart
  try {
    const { cart } = await sdk.store.cart.retrieve(cartId, {
      fields: "id,*items",
    })
    source = cart as RecoverCart
  } catch {
    return to("/sepet")
  }

  const items = (source.items ?? []).filter((i) => i.variant_id)
  if (!items.length) return to("/sepet")

  try {
    const fresh = await createCart()
    await setCartIdCookie(fresh.id)
    for (const item of items) {
      try {
        await sdk.store.cart.createLineItem(
          fresh.id,
          { variant_id: item.variant_id as string, quantity: item.quantity ?? 1 },
          { fields: CART_FIELDS }
        )
      } catch {
        // Tükenmiş / yayından kalkmış varyant: kalanları yine ekle
      }
    }
    const token = await getAuthToken()
    if (token) await transferCartToCustomer(token)
  } catch {
    return to("/sepet")
  }

  return to("/odeme")
}
