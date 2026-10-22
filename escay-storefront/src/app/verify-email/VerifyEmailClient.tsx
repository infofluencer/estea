"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  confirmEmailVerificationAction,
  resendVerificationAction,
} from "@/lib/auth/actions"
import formStyles from "@/components/auth/auth-form.module.css"

export function VerifyEmailClient({
  token,
  email,
}: {
  token?: string
  email?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resendPending, startResend] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">(
    token ? "idle" : "error"
  )
  const [message, setMessage] = useState<string | null>(
    token ? null : "Geçersiz veya eksik doğrulama bağlantısı."
  )
  const [loggedIn, setLoggedIn] = useState(false)
  const [resendInfo, setResendInfo] = useState<string | null>(null)
  const [password, setPassword] = useState("")

  useEffect(() => {
    if (!token) return
    startTransition(async () => {
      const result = await confirmEmailVerificationAction(token)
      if (result.ok) {
        setStatus("success")
        setMessage(result.message || "E-postanız doğrulandı.")
        if (result.logged_in) {
          setLoggedIn(true)
          router.refresh()
          router.replace("/hesabim")
        }
        return
      }
      setStatus("error")
      setMessage(result.message)
    })
  }, [token, router])

  function onResend(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setResendInfo(null)
    startResend(async () => {
      const result = await resendVerificationAction({
        email,
        password: password || undefined,
      })
      setResendInfo(result.message || null)
    })
  }

  return (
    <div className={formStyles.page} data-testid="verify-email-page">
      <header className={formStyles.head}>
        <h1 className={formStyles.title}>E-posta Doğrulama</h1>
      </header>

      {pending && status === "idle" ? (
        <p className={formStyles.lead}>Doğrulanıyor…</p>
      ) : null}

      {status === "success" ? (
        <div className={formStyles.actions}>
          <p className={formStyles.success}>{message}</p>
          {loggedIn ? (
            <p className={formStyles.lead}>Hesabınıza yönlendiriliyorsunuz…</p>
          ) : (
            <Link href="/?login=1" className={formStyles.submitLink}>
              Giriş yap
            </Link>
          )}
        </div>
      ) : null}

      {status === "error" ? (
        <div className={formStyles.actions}>
          <p className={formStyles.error}>{message}</p>
          {email ? (
            <form className={formStyles.form} onSubmit={onResend}>
              <p className={formStyles.lead}>
                Yeni bağlantı istemek için şifrenizi girin.
              </p>
              <div className={formStyles.field}>
                <label className={formStyles.label} htmlFor="verify-password">
                  Şifre
                </label>
                <input
                  id="verify-password"
                  type="password"
                  className={formStyles.input}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {resendInfo ? (
                <p
                  className={
                    /gönderildi|doğrulanmış/i.test(resendInfo)
                      ? formStyles.success
                      : formStyles.error
                  }
                >
                  {resendInfo}
                </p>
              ) : null}
              <button
                type="submit"
                className={formStyles.submit}
                disabled={resendPending}
              >
                {resendPending ? "Gönderiliyor…" : "Yeni bağlantı iste"}
              </button>
            </form>
          ) : (
            <Link href="/?login=1" className={formStyles.link}>
              Giriş yap
            </Link>
          )}
        </div>
      ) : null}
    </div>
  )
}
