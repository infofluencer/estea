"use client"

import { useEffect, useId, useRef } from "react"

type CheckoutAlertDialogProps = {
  open: boolean
  title?: string
  message: string
  onClose: () => void
  /** Verilirse ikinci buton: kullanıcı uyarıya rağmen devam eder. */
  confirmLabel?: string
  onConfirm?: () => void
  /** Kapat butonu metni (varsayılan "Tamam"). */
  closeLabel?: string
}

export function CheckoutAlertDialog({
  open,
  title = "Eksik veya hatalı bilgi",
  message,
  onClose,
  confirmLabel,
  onConfirm,
  closeLabel = "Tamam",
}: CheckoutAlertDialogProps) {
  const titleId = useId()
  const messageId = useId()
  const okRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    okRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }

    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="checkout-alert"
      role="alertdialog"
      data-testid="checkout-alert"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={messageId}
    >
      <button
        type="button"
        className="checkout-alert__backdrop"
        aria-label="Kapat"
        onClick={onClose}
      />
      <div className="checkout-alert__panel">
        <h2 id={titleId} className="checkout-alert__title">
          {title}
        </h2>
        <p
          id={messageId}
          className="checkout-alert__message"
          data-testid="checkout-alert-message"
        >
          {message}
        </p>
        <button
          ref={okRef}
          type="button"
          className="checkout-alert__ok cart-cta cart-cta--primary"
          data-testid="checkout-alert-close"
          onClick={onClose}
        >
          {closeLabel}
        </button>
        {onConfirm && confirmLabel ? (
          <button
            type="button"
            className="checkout-alert__ok cart-cta"
            data-testid="checkout-alert-confirm"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
