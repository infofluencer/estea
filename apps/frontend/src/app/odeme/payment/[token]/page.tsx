import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary"
import { PaytrIframe } from "@/components/PaytrIframe"
import { cartLineImage, variantLabel } from "@/components/cart/cart-utils"
import { loadCheckoutBootstrap } from "@/lib/checkout-actions"
import { isSafePaytrIframeToken } from "@/lib/paytr-iframe-token"

export const dynamic = "force-dynamic"

/**
 * PayTR iframe adımı. Sipariş henüz yok, sepet açık: müşteri ne için ödediğini
 * (ürünler, teslimat adresi, toplam) formun yanında görür.
 *
 * Fail → /odeme/payment-result (PayTR merchant_fail_url); müşteri aynı sepetle tekrar dener
 * Success → /odeme/payment-result: sipariş oluşana kadar bekler, sonra onay sayfası
 */
export default async function CheckoutPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!isSafePaytrIframeToken(token)) {
    notFound()
  }

  const { cart } = await loadCheckoutBootstrap()
  const hasCart = Boolean(cart?.id && (cart.items || []).length)
  // Adres girilmemiş sepette (doğrudan URL) özet kutusu çizilmez.
  const addr = cart?.shipping_address?.address_1 ? cart.shipping_address : null
  const district =
    (addr?.metadata as { district?: string | null } | null | undefined)
      ?.district || null

  return (
    <div className="checkout-page-wrap">
      <div className="page-shell checkout-page">
        <CheckoutProgress current="payment" />

        <div
          className={`checkout-layout${hasCart ? "" : " checkout-layout--payment"}`}
        >
          <div className="checkout-main">
            <h1 className="checkout-main__title">Ödeme</h1>

            <div className="checkout-payment" data-testid="checkout-payment">
              {hasCart && addr ? (
                <div className="checkout-recap">
                  <div className="checkout-recap__body">
                    <span className="checkout-recap__label">Teslimat adresi</span>
                    <p className="checkout-recap__text">
                      <strong>
                        {addr.first_name} {addr.last_name}
                      </strong>
                      <br />
                      {addr.address_1}
                      {addr.address_2 ? `, ${addr.address_2}` : ""}
                      <br />
                      {district ? `${district}, ` : ""}
                      {addr.city}
                      {addr.postal_code ? ` ${addr.postal_code}` : ""}
                    </p>
                  </div>
                  <Link
                    href="/odeme"
                    className="checkout-recap__edit"
                    data-testid="checkout-payment-back"
                  >
                    Değiştir
                  </Link>
                </div>
              ) : null}

              <section className="checkout-payment__card" aria-labelledby="pay-card-title">
                <div className="checkout-payment__head">
                  <h2 id="pay-card-title" className="checkout-section-title">
                    Kart bilgileri
                  </h2>
                  <span className="checkout-payment__secure">
                    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                      <rect
                        x="3"
                        y="7"
                        width="10"
                        height="7"
                        rx="1.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M5.5 7V5a2.5 2.5 0 015 0v2"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    PayTR güvenli ödeme
                  </span>
                </div>
                <p className="checkout-payment__lead">
                  Kart bilgileriniz Esçay&rsquo;a ulaşmaz; PayTR&rsquo;nin 3D Secure
                  sayfasında işlenir. Ödeme tamamlanınca siparişiniz otomatik oluşur.
                </p>
                <div className="checkout-payment__frame">
                  <PaytrIframe iframeToken={token} />
                </div>
              </section>

              <div className="checkout-payment__foot">
                {hasCart && addr ? (
                  <Link href="/odeme" className="checkout-payment__back">
                    Adres adımına dön
                  </Link>
                ) : (
                  <Link
                    href="/odeme"
                    className="checkout-payment__back"
                    data-testid="checkout-payment-back"
                  >
                    Adres adımına dön
                  </Link>
                )}
              </div>
            </div>
          </div>

          {hasCart ? (
            <CheckoutOrderSummary
              editHref="/sepet"
              useAppliedShipping
              cart={{
                item_subtotal: cart!.item_subtotal,
                item_total: cart!.item_total,
                subtotal: cart!.subtotal,
                discount_total: (cart as { discount_total?: number | null })
                  .discount_total,
                original_item_total: (
                  cart as { original_item_total?: number | null }
                ).original_item_total,
                shipping_total: cart!.shipping_total,
                total: cart!.total,
                items: (cart!.items || []).map((i) => {
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
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
