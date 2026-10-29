import Link from "next/link"

export function CartActions() {
  return (
    <div className="cart-actions">
      <Link href="/odeme" className="cart-cta cart-cta--primary">
        Ödemeye geç
      </Link>
      <Link href="/urun-kategori" className="cart-actions__continue">
        Alışverişe devam et
      </Link>
    </div>
  )
}
