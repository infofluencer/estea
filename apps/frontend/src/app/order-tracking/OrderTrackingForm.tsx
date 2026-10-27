"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import formStyles from "@/components/auth/auth-form.module.css"
import { lookupOrderAction } from "@/lib/order-tracking-actions"

type Props = {
  initialOrder?: string
  initialEmail?: string
  /** When true and initials present, run lookup once and redirect to result. */
  autoLookup?: boolean
}

export function OrderTrackingForm({
  initialOrder = "",
  initialEmail = "",
  autoLookup = false,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [id, setId] = useState(initialOrder)
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState<string | null>(null)
  const autoStarted = useRef(false)

  function runLookup(orderValue: string, emailValue: string) {
    setError(null)
    startTransition(async () => {
      const result = await lookupOrderAction(orderValue, emailValue)
      if (!result.ok) {
        setError(result.message)
        return
      }
      const q = new URLSearchParams({ email: emailValue.trim() })
      router.push(
        `/order-tracking/${encodeURIComponent(result.order.id)}?${q.toString()}`
      )
    })
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    runLookup(id, email)
  }

  useEffect(() => {
    if (!autoLookup || autoStarted.current) return
    if (!initialOrder.trim() || !initialEmail.trim()) return
    autoStarted.current = true
    runLookup(initialOrder, initialEmail)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot deep link
  }, [autoLookup, initialOrder, initialEmail])

  return (
    <div className={formStyles.page} style={{ maxWidth: "40rem" }}>
      <header className={formStyles.head}>
        <h1 className={formStyles.title}>Sipariş Takibi</h1>
        <p className={formStyles.lead}>
          Misafir siparişiniz için sipariş numarası ve e-posta adresinizi girin.
          Sipariş numaranız onay e-postasında yer alır (ör. #100003).
        </p>
      </header>

      <form className={formStyles.form} onSubmit={onSubmit}>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="track-order-id">
            Sipariş numarası
          </label>
          <input
            id="track-order-id"
            data-testid="order-tracking-id"
            className={formStyles.input}
            value={id}
            onChange={(e) => setId(e.target.value)}
            placeholder="#100003"
            autoComplete="off"
            required
          />
        </div>
        <div className={formStyles.field}>
          <label className={formStyles.label} htmlFor="track-email">
            E-posta
          </label>
          <input
            id="track-email"
            data-testid="order-tracking-email"
            type="email"
            className={formStyles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        {error ? (
          <p className={formStyles.error} data-testid="order-tracking-error">
            {error}
          </p>
        ) : null}

        <div className={formStyles.actions}>
          <button
            type="submit"
            data-testid="order-tracking-submit"
            className={formStyles.submit}
            disabled={pending}
          >
            {pending ? "Sorgulanıyor…" : "Siparişi getir"}
          </button>
        </div>
      </form>
    </div>
  )
}
