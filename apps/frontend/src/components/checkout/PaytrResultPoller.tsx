"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  finalizePaidCheckoutSession,
  pollPaytrCheckoutAction,
} from "@/lib/checkout-actions"

const POLL_INTERVAL_MS = 2000
// Sunucu her sorguda PayTR'ye de sorar (bildirim gelmese de); 3 dk bekleme yeterli.
const POLL_LIMIT_MS = 180_000

type ResultState = "waiting" | "pending" | "attention"

/**
 * Sipariş PayTR bildirimi işlenince oluşur; müşteri çoğu zaman bildirimden önce döner.
 * Sipariş görününce onay sayfasına geçer. Süre dolarsa sepet bırakılır (müşteri ödenmiş
 * sepete ürün eklemesin) ve sipariş e-postayla bildirilir: bildirim geç gelse de işlenir.
 * Para alınıp sipariş elle incelemeye düşmüşse müşteriye bekletmeden söylenir.
 */
export function PaytrResultPoller({ oid }: { oid: string }) {
  const [state, setState] = useState<ResultState>(oid ? "waiting" : "pending")

  useEffect(() => {
    if (!oid) return
    let stopped = false
    const startedAt = Date.now()

    const tick = async () => {
      const res = await pollPaytrCheckoutAction(oid)
      if (stopped) return
      if (res.state === "completed") {
        window.location.href = `/odeme/confirmation/${res.orderId}`
        return
      }
      if (res.state === "attention") {
        await finalizePaidCheckoutSession()
        if (!stopped) setState("attention")
        return
      }
      if (res.state === "unknown") {
        setState("pending")
        return
      }
      if (Date.now() - startedAt >= POLL_LIMIT_MS) {
        await finalizePaidCheckoutSession()
        if (!stopped) setState("pending")
        return
      }
      setTimeout(() => void tick(), POLL_INTERVAL_MS)
    }

    void tick()
    return () => {
      stopped = true
    }
  }, [oid])

  const waiting = state === "waiting"

  return (
    <div
      className="checkout-result"
      role="status"
      aria-live="polite"
      data-testid="paytr-result"
      data-state={state}
    >
      <span
        className={`checkout-result__disc${waiting ? " checkout-result__disc--busy" : ""}${
          state === "attention" ? " checkout-result__disc--fail" : ""
        }`}
        aria-hidden
      >
        {waiting ? (
          <svg viewBox="0 0 24 24" width="24" height="24" className="checkout-result__ring">
            <circle
              cx="12"
              cy="12"
              r="9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              pathLength={1}
            />
          </svg>
        ) : state === "attention" ? (
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path
              d="M12 7v6M12 16.5v.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="24" height="24">
            <path
              d="M5 12.5l4.2 4.2L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>

      <h1 className="checkout-result__title">
        {state === "attention" ? "Ödemeniz alındı, sipariş inceleniyor" : "Ödemeniz alındı"}
      </h1>

      {state === "waiting" ? (
        <p className="checkout-result__text">
          Siparişiniz oluşturuluyor; bu birkaç saniye sürer. Sayfadan ayrılmanıza
          gerek yok, hazır olunca sipariş onayına geçeceğiz.
        </p>
      ) : state === "attention" ? (
        <p className="checkout-result__text">
          Ödemeniz bize ulaştı ama sipariş otomatik oluşturulamadı; ekibimiz kaydı
          elden kontrol edip en geç bir iş günü içinde sizinle iletişime geçecek.
          Yeniden ödeme yapmanıza gerek yok.
        </p>
      ) : (
        <p className="checkout-result__text">
          Ödemeniz işleme alındı; sipariş kaydı birkaç dakika içinde tamamlanır ve
          onay e-postası gelir. Bu sayfayı yenileyerek de kontrol edebilirsiniz.
        </p>
      )}

      {oid ? (
        <p className="checkout-result__ref">
          İşlem referansı <span>{oid}</span>
        </p>
      ) : null}

      {waiting ? null : (
        <div className="checkout-result__actions">
          <Link href="/hesabim" className="cart-cta cart-cta--ink">
            Siparişlerim
          </Link>
          <Link href="/urun-kategori" className="cart-cta">
            Alışverişe devam et
          </Link>
        </div>
      )}

      {waiting ? null : (
        <p className="checkout-result__help">
          Sorunuz için{" "}
          <a href="tel:+904626923061">0462 692 30 61</a>
          {state === "attention" ? " — işlem referansını belirtin." : "."}
        </p>
      )}
    </div>
  )
}
