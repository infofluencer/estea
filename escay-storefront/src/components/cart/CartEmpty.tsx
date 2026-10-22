import Link from "next/link"

export function CartEmpty() {
  return (
    <div className="cart-empty">
      <h1 className="cart-empty__title">Sepetiniz boş</h1>
      <p className="cart-empty__text">
        Henüz sepetinize bir ürün eklemediniz.
      </p>
      <Link href="/urun-kategori" className="cart-cta cart-cta--primary">
        Alışverişe başla
      </Link>
    </div>
  )
}
