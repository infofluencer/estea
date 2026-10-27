"use client"

import { useId, useState, useTransition, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import {
  applyPromoCodeAction,
  removePromoCodeAction,
} from "@/lib/checkout-actions"

type AppliedPromo = {
  code: string
}

type PromoCodeFormProps = {
  applied?: AppliedPromo[]
  /** Called after successful apply/remove when parent holds cart state. */
  onUpdated?: () => void | Promise<void>
  /** Use router.refresh when parent is a server component page. */
  refreshOnSuccess?: boolean
  /** Hide the field label when a parent section title already names it. */
  hideLabel?: boolean
}

export function PromoCodeForm({
  applied = [],
  onUpdated,
  refreshOnSuccess = false,
  hideLabel = false,
}: PromoCodeFormProps) {
  const router = useRouter()
  const inputId = useId()
  const [pending, startTransition] = useTransition()
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function afterChange() {
    if (onUpdated) await onUpdated()
    if (refreshOnSuccess) router.refresh()
  }

  function onApply(e?: FormEvent) {
    e?.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await applyPromoCodeAction(code)
      if (!result.ok) {
        setError(result.message || "İndirim kodu uygulanamadı.")
        return
      }
      setCode("")
      await afterChange()
    })
  }

  function onRemove(promoCode: string) {
    setError(null)
    startTransition(async () => {
      const result = await removePromoCodeAction(promoCode)
      if (!result.ok) {
        setError(result.message || "İndirim kodu kaldırılamadı.")
        return
      }
      await afterChange()
    })
  }

  return (
    <div className="checkout-promo" data-testid="checkout-promo">
      {applied.length > 0 ? (
        <ul
          className="checkout-promo__applied"
          data-testid="checkout-promo-applied"
        >
          {applied.map((p) => (
            <li key={p.code} className="checkout-promo__chip">
              <span className="checkout-promo__chip-code">
                Kod: <strong>{p.code}</strong>
              </span>
              <button
                type="button"
                className="checkout-promo__remove"
                disabled={pending}
                onClick={() => onRemove(p.code)}
              >
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form className="checkout-promo__form" onSubmit={onApply}>
        {hideLabel ? (
          <label className="sr-only" htmlFor={inputId}>
            İndirim kodu
          </label>
        ) : (
          <label className="checkout-promo__label" htmlFor={inputId}>
            İndirim kodu
          </label>
        )}
        <div className="checkout-promo__row">
          <input
            id={inputId}
            data-testid="checkout-promo-input"
            className="checkout-promo__input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Kupon kodunuz"
            autoComplete="off"
            disabled={pending}
          />
          <button
            type="submit"
            data-testid="checkout-promo-apply"
            className="checkout-promo__apply"
            disabled={pending || !code.trim()}
          >
            {pending ? "…" : "Uygula"}
          </button>
        </div>
      </form>

      {error ? (
        <p
          className="checkout-error checkout-error--inline"
          role="alert"
          data-testid="checkout-promo-error"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
