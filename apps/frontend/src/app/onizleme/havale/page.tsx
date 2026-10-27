import { notFound } from "next/navigation"
import Link from "next/link"
import { CheckoutConfirmationView } from "@/components/checkout/CheckoutConfirmationView"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { OrderDetail } from "@/components/order/OrderDetail"
import type { OrderDetailView } from "@/components/order/order-types"

/**
 * Yalnızca lokal: havale onay / takip ekranı önizlemesi — sahte veri, API'ye
 * istek yok, sipariş / mail / stok tetiklenmez. Prod build'de 404.
 *
 *   npm run dev → http://localhost:3000/onizleme/havale
 *                 http://localhost:3000/onizleme/havale?gorunum=takip
 */
export const dynamic = "force-dynamic"

const MOCK_ORDER: OrderDetailView = {
  id: "order_onizleme",
  display_id: 59,
  status: "pending",
  email: "musteri@ornek.com",
  currency_code: "try",
  created_at: new Date().toISOString(),
  total: 5147.9,
  item_total: 4998,
  item_subtotal: 4998,
  original_item_total: 4998,
  discount_total: 0,
  shipping_total: 149.9,
  payment_collections: [{ id: "pay_col_onizleme", status: "awaiting" }],
  bank_transfer: {
    bank_name: "İŞ BANKASI",
    account_name: "Hamzalı Çay Gıda Tur. ve İnş. A.Ş.",
    iban: "TR00 0000 0000 0000 0000 0000 00",
  },
  items: [
    { id: "item_1", title: "Rize Siyah Çay", quantity: 1, unit_price: 2499, variant: { title: "500 g" } },
    { id: "item_2", title: "Bergamot Çay", quantity: 1, unit_price: 2499, variant: { title: "250 g" } },
  ],
  shipping_address: {
    first_name: "Ayşe",
    last_name: "Yılmaz",
    address_1: "Örnek Mah. Deneme Sk. No:1",
    city: "İstanbul",
    postal_code: "34000",
    country_code: "tr",
    phone: "+905000000000",
    metadata: { district: "Şişli" },
  },
  shipping_methods: [{ name: "Standart Kargo", amount: 99.9 }],
} as OrderDetailView

export default async function BankTransferPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ gorunum?: string }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const { gorunum } = await searchParams
  const tracking = gorunum === "takip"

  return (
    <div className="page-shell" style={{ paddingBottom: "3.5rem" }}>
      <p style={{ margin: "0 0 1rem", fontSize: "0.8rem", opacity: 0.6 }}>
        Önizleme (sahte veri) ·{" "}
        <Link href="/onizleme/havale">Onay sayfası</Link> ·{" "}
        <Link href="/onizleme/havale?gorunum=takip">Sipariş takip</Link>
      </p>
      {tracking ? (
        <OrderDetail order={MOCK_ORDER} />
      ) : (
        <>
          <CheckoutProgress current="confirmation" />
          <CheckoutConfirmationView order={MOCK_ORDER} />
        </>
      )}
    </div>
  )
}
