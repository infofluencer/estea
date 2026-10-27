import Link from "next/link"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { FinalizePaidCheckoutOnMount } from "@/components/checkout/FinalizePaidCheckoutOnMount"
import { RestorePendingCheckoutOnMount } from "@/components/checkout/RestorePendingCheckoutOnMount"
import { LAST_ORDER_ID_COOKIE } from "@/lib/auth/constants"

/**
 * PayTR merchant_ok_url / merchant_fail_url hedef sayfası.
 *
 * URL: /checkout/payment-result?status=success|failed&oid=MERCHANT_OID
 *
 * KRİTİK UYARI:
 * Bu sayfaya ulaşmak ödeme onayı DEĞİLDİR.
 * Gerçek ödeme onayı /paytr/callback webhook'undan gelir (sunucu tarafında).
 * Bu sayfa yalnızca kullanıcıyı bilgilendirme amaçlıdır.
 *
 * Cookie mutasyonları RSC render'da yapılamaz — success temizliği confirmation
 * mount action'ında; fail restore client mount action'ında.
 */
export const dynamic = "force-dynamic"

type Props = {
  searchParams: Promise<{ status?: string; oid?: string }>
}

export default async function PaymentResultPage({ searchParams }: Props) {
  const { status, oid } = await searchParams
  const isSuccess = status === "success"

  if (isSuccess) {
    const jar = await cookies()
    const orderId = jar.get(LAST_ORDER_ID_COOKIE)?.value
    if (orderId) {
      redirect(`/odeme/confirmation/${orderId}`)
    }
  }

  return (
    <div className="page-shell checkout-page" style={{ paddingBottom: "3.5rem" }}>
      {isSuccess ? <FinalizePaidCheckoutOnMount /> : <RestorePendingCheckoutOnMount />}
      <div
        className="checkout-empty"
        style={{
          maxWidth: "32rem",
          margin: "2rem auto 0",
          textAlign: "center",
        }}
      >
        {isSuccess ? (
          <>
            <h1 className="checkout-empty__title">Ödemeniz Alındı</h1>
            <p className="checkout-empty__text">
              Ödemeniz işleme alındı. Siparişiniz onaylanınca size e-posta
              bildirimi gönderilecektir. Durumu hesabım &gt; siparişlerim
              bölümünden takip edebilirsiniz.
            </p>
            {oid ? (
              <p className="checkout-muted" style={{ marginTop: "0.75rem" }}>
                İşlem ref: {oid}
              </p>
            ) : null}
            <div
              className="checkout-form__actions"
              style={{ justifyContent: "center", marginTop: "1.5rem" }}
            >
              <Link href="/" className="cart-cta cart-cta--primary">
                Alışverişe devam et
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="checkout-empty__title">Ödeme Tamamlanamadı</h1>
            <p className="checkout-empty__text">
              Ödeme işlemi tamamlanamadı. Kart bilgilerinizi kontrol ederek
              tekrar deneyebilirsiniz. Sorun sürerse hesap sayfanızdaki
              siparişlerinizden veya iletişim formundan bize yazın.
            </p>
            {oid ? (
              <p className="checkout-muted" style={{ marginTop: "0.75rem" }}>
                İşlem ref: {oid}
              </p>
            ) : null}
            <div
              className="checkout-form__actions checkout-form__actions--split"
              style={{ justifyContent: "center", marginTop: "1.5rem" }}
            >
              <Link href="/odeme" className="cart-cta cart-cta--primary">
                Tekrar dene
              </Link>
              <Link href="/sepet" className="cart-cta">
                Sepete dön
              </Link>
              <Link href="/iletisim" className="cart-cta">
                İletişim
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
