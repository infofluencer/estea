import Link from "next/link"
import type { CSSProperties } from "react"

export type CheckoutProgressStep = "cart" | "address" | "payment" | "confirmation"

const STEP_ORDER: CheckoutProgressStep[] = [
  "cart",
  "address",
  "payment",
  "confirmation",
]

export function CheckoutProgress({
  current = "cart",
}: {
  current?: CheckoutProgressStep
}) {
  const pastCart = current !== "cart"
  const addressActive = current === "address"
  const pastAddress = current === "payment" || current === "confirmation"
  const paymentActive = current === "payment"
  const pastPayment = current === "confirmation"
  // Adım çizgisi: önceki noktadan geçerli noktaya dolar (0–3 adım arası).
  const stepIndex = STEP_ORDER.indexOf(current)
  const progressStyle = {
    "--progress": stepIndex / 3,
    "--progress-from": Math.max(0, stepIndex - 1) / 3,
  } as CSSProperties

  return (
    <nav className="cart-progress" aria-label="Sipariş adımları">
      <ol
        className="cart-progress__list cart-progress__list--four"
        style={progressStyle}
      >
        <li
          className={`cart-progress__step${current === "cart" ? " is-active" : ""}${pastCart ? " is-complete" : ""}`}
          aria-current={current === "cart" ? "step" : undefined}
        >
          {current === "cart" ? (
            <>
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Sepet</span>
            </>
          ) : (
            <Link href="/sepet" className="cart-progress__link">
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Sepet</span>
            </Link>
          )}
        </li>

        <li
          className={`cart-progress__step${addressActive ? " is-active" : ""}${pastAddress ? " is-complete" : ""}${!pastCart && !addressActive ? " is-disabled" : ""}`}
          aria-current={addressActive ? "step" : undefined}
        >
          {addressActive ? (
            <>
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Adres</span>
            </>
          ) : pastAddress ? (
            <Link href="/odeme" className="cart-progress__link">
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Adres</span>
            </Link>
          ) : (
            <span className="cart-progress__link cart-progress__link--static">
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Adres</span>
            </span>
          )}
        </li>

        <li
          className={`cart-progress__step${paymentActive ? " is-active" : ""}${pastPayment ? " is-complete" : ""}${!pastAddress && !paymentActive ? " is-disabled" : ""}`}
          aria-current={paymentActive ? "step" : undefined}
        >
          {paymentActive ? (
            <>
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Ödeme</span>
            </>
          ) : pastPayment ? (
            <>
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Ödeme</span>
            </>
          ) : (
            <span className="cart-progress__link cart-progress__link--static">
              <span className="cart-progress__dot" aria-hidden />
              <span className="cart-progress__label">Ödeme</span>
            </span>
          )}
        </li>

        <li
          className={`cart-progress__step${pastPayment ? " is-active" : " is-disabled"}`}
          aria-current={pastPayment ? "step" : undefined}
        >
          <span className="cart-progress__dot" aria-hidden />
          <span className="cart-progress__label">Onay</span>
        </li>
      </ol>
    </nav>
  )
}
