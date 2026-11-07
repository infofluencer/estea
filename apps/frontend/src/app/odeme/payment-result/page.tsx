import Link from "next/link"
import { CheckoutProgress } from "@/components/cart/CheckoutProgress"
import { PaytrResultPoller } from "@/components/checkout/PaytrResultPoller"
import { RestorePendingCheckoutOnMount } from "@/components/checkout/RestorePendingCheckoutOnMount"

/**
 * PayTR merchant_ok_url / merchant_fail_url hedef sayfası.
 *
 * URL: /checkout/payment-result?status=success|failed&oid=MERCHANT_OID
 *
 * KRİTİK UYARI:
 * Bu sayfaya ulaşmak ödeme onayı DEĞİLDİR.
 * Gerçek ödeme onayı /paytr/callback webhook'undan gelir (sunucu tarafında).
 * Bu sayfa yalnızca kullanıcıyı bilgilendirme amaçlıdır. Sipariş bildirim işlenince
 * oluşur; success'te sayfa siparişi bekler, oluşunca onay sayfasına geçer.
 *
 * Cookie mutasyonları RSC render'da yapılamaz — success temizliği server action'da;
 * fail restore client mount action'ında.
 */
export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ status?: string; oid?: string }>
}

export default async function PaymentResultPage({ searchParams }: Props) {
  const { status, oid } = await searchParams
  const isSuccess = status === "success"

  return (
    <div className="checkout-page-wrap">
      <div className="page-shell checkout-page">
        <CheckoutProgress current="payment" />
        {isSuccess ? null : <RestorePendingCheckoutOnMount />}

        <div className="checkout-empty checkout-empty--center" data-testid="checkout-empty">
          {isSuccess ? (
            <PaytrResultPoller oid={oid || ""} />
          ) : (
            <div className="checkout-result" data-state="failed">
              <span className="checkout-result__disc checkout-result__disc--fail" aria-hidden>
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path
                    d="M7 7l10 10M17 7L7 17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <h1 className="checkout-result__title">Ödeme tamamlanamadı</h1>
              <p className="checkout-result__text">
                Bankanız işlemi onaylamadı ya da işlem yarıda kaldı. Kartınızdan
                para çekilmedi; sepetiniz duruyor. Kart bilgilerini kontrol edip
                tekrar deneyebilir ya da başka bir kartla ödeyebilirsiniz.
              </p>
              {oid ? (
                <p className="checkout-result__ref">
                  İşlem referansı <span>{oid}</span>
                </p>
              ) : null}
              <div className="checkout-result__actions">
                <Link href="/odeme" className="cart-cta cart-cta--primary">
                  Tekrar dene
                </Link>
                <Link href="/sepet" className="cart-cta">
                  Sepete dön
                </Link>
              </div>
              <p className="checkout-result__help">
                Sorun sürerse{" "}
                <a href="tel:+904626923061">0462 692 30 61</a> numarasından ya da{" "}
                <Link href="/iletisim">iletişim formundan</Link> bize ulaşın.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
