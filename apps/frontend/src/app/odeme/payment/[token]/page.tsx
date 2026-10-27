import Link from "next/link"
import { notFound } from "next/navigation"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { PaytrIframe } from "@/components/PaytrIframe"
import { isSafePaytrIframeToken } from "@/lib/paytr-iframe-token"

export const dynamic = "force-dynamic"

/**
 * PayTR iframe adımı — sepete bakmaz.
 * cart cookie silinmesi bu sayfayı unmount etmez (Yol C).
 *
 * Fail → /checkout/payment-result (PayTR merchant_fail_url)
 * Success → /checkout/payment-result → confirmation + finalizePaidCheckoutSession
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

  return (
    <div className="checkout-page-wrap">
      <div className="page-shell checkout-page">
        <CheckoutProgress current="payment" />

        <div className="checkout-layout checkout-layout--payment">
          <div className="checkout-main">
            <h1 className="checkout-main__title">Ödeme</h1>
            <div className="checkout-payment" data-testid="checkout-payment">
              <p className="checkout-payment__lead">
                Ödeme bilgilerinizi güvenli PayTR formuna girin. Ödeme
                tamamlandıktan sonra siparişiniz otomatik onaylanacaktır.
              </p>
              <div className="checkout-payment__frame">
                <PaytrIframe iframeToken={token} />
              </div>
              <div className="checkout-form__actions checkout-form__actions--split">
                <Link
                  href="/odeme"
                  className="cart-cta"
                  data-testid="checkout-payment-back"
                >
                  Geri
                </Link>
                <Link href="/sepet" className="cart-cta">
                  Sepete dön
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
