"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  authPasswordTooShortMessage,
} from "@/lib/auth/constants"
import {
  requestPasswordResetAction,
  resetPasswordAction,
} from "@/lib/reset-password-actions"
import styles from "./reset-password.module.css"

const successKey = (email: string) =>
  `escay-pw-reset-done:${email.trim().toLowerCase()}`

export function ResetPasswordForm({
  token,
  email,
}: {
  token: string
  email: string
}) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [resent, setResent] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [resendPending, startResendTransition] = useTransition()

  useEffect(() => {
    try {
      if (sessionStorage.getItem(successKey(email)) === "1") {
        setSuccess(true)
      }
    } catch {
      /* private mode / blocked storage */
    }
  }, [email])

  const passwordsMatch = useMemo(
    () => password === confirmPassword,
    [password, confirmPassword]
  )

  const canSubmit =
    password.length >= AUTH_PASSWORD_MIN_LENGTH &&
    confirmPassword.length >= AUTH_PASSWORD_MIN_LENGTH &&
    passwordsMatch &&
    !pending &&
    !success

  function validateClient(): string | null {
    if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
      return authPasswordTooShortMessage()
    }
    if (!passwordsMatch) {
      return "Şifreler eşleşmiyor."
    }
    return null
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setClientError(null)
    setServerError(null)
    setResent(null)

    const validationError = validateClient()
    if (validationError) {
      setClientError(validationError)
      return
    }

    startTransition(async () => {
      const result = await resetPasswordAction({ token, email, password })
      if (result.ok) {
        setSuccess(true)
        try {
          sessionStorage.setItem(successKey(email), "1")
        } catch {
          /* ignore */
        }
        return
      }
      setServerError(result.message)
    })
  }

  function handleResend() {
    setResent(null)
    setServerError(null)
    startResendTransition(async () => {
      const result = await requestPasswordResetAction(email)
      setResent(result.message)
    })
  }

  if (success) {
    return (
      <div className={styles.page}>
        <header className={styles.head}>
          <h1 className={styles.title}>Şifre güncellendi</h1>
        </header>
        <p className={styles.success}>
          Yeni şifreniz kaydedildi. Artık bu şifreyle giriş yapabilirsiniz.
        </p>
        <div className={styles.actions}>
          <Link href="/?login=1" className={styles.submitLink}>
            Giriş yap
          </Link>
          <Link href="/" className={styles.link}>
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    )
  }

  const showExpiredActions = serverError?.includes("süresi dolmuş")

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>Yeni şifre</h1>
        <p className={styles.lead}>
          Hesabınız için yeni bir şifre belirleyin.
        </p>
        <p className={styles.emailHint}>{email}</p>
      </header>

      <form
        className={styles.form}
        onSubmit={handleSubmit}
        noValidate
        data-testid="reset-password-form"
      >
        <div className={styles.field}>
          <label className={styles.label} htmlFor="new-password">
            Yeni şifre
          </label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            minLength={AUTH_PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className={styles.hint}>
            En az {AUTH_PASSWORD_MIN_LENGTH} karakter
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-password">
            Yeni şifre (tekrar)
          </label>
          <input
            id="confirm-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            minLength={AUTH_PASSWORD_MIN_LENGTH}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>

        {clientError && (
          <p className={styles.error} data-testid="reset-password-error">
            {clientError}
          </p>
        )}
        {serverError && (
          <p className={styles.error} data-testid="reset-password-error">
            {serverError}
          </p>
        )}
        {resent && <p className={styles.success}>{resent}</p>}

        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.submit}
            disabled={!canSubmit}
          >
            {pending ? "Kaydediliyor…" : "Şifreyi güncelle"}
          </button>

          {showExpiredActions && (
            <button
              type="button"
              className={styles.secondaryBtn}
              disabled={resendPending}
              onClick={handleResend}
            >
              {resendPending ? "Gönderiliyor…" : "Yeni sıfırlama bağlantısı iste"}
            </button>
          )}

          <Link href="/" className={styles.link}>
            Ana sayfaya dön
          </Link>
        </div>
      </form>
    </div>
  )
}
