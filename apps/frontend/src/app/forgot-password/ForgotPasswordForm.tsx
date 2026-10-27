"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { requestPasswordResetAction } from "@/lib/auth/actions"
import formStyles from "@/components/auth/auth-form.module.css"

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await requestPasswordResetAction(email)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSuccess(result.message || "")
      setEmail("")
    })
  }

  return (
    <div className={formStyles.page}>
      <header className={formStyles.head}>
        <h1 className={formStyles.title}>Şifremi Unuttum</h1>
      </header>

      {success ? (
        <div className={formStyles.actions} data-testid="forgot-success">
          <p className={formStyles.success}>{success}</p>
          <Link href="/?login=1" className={formStyles.submitLink}>
            Giriş yap
          </Link>
        </div>
      ) : (
        <form className={formStyles.form} onSubmit={onSubmit}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="forgot-email">
              E-posta
            </label>
            <input
              id="forgot-email"
              data-testid="forgot-email"
              type="email"
              className={formStyles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <div className={formStyles.actions}>
            <button
              type="submit"
              data-testid="forgot-submit"
              className={formStyles.submit}
              disabled={pending}
            >
              {pending ? "Gönderiliyor…" : "Bağlantı gönder"}
            </button>
            <Link href="/?login=1" className={formStyles.link}>
              Giriş yap
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
