"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  loginAction,
  registerAction,
  resendVerificationAction,
} from "@/lib/auth/actions"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  authPasswordTooShortMessage,
} from "@/lib/auth/constants"
import { syncWishlistAction } from "@/lib/auth/wishlist-actions"
import { readFavorites, toWishlistInput } from "@/lib/favorites"
import styles from "./login-panel.module.css"

type PanelMode = "login" | "register" | "verify_pending"

type LoginPanelProps = {
  open: boolean
  onClose: () => void
  initialMode?: "login" | "register"
}

const emptyRegisterForm = () => ({
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  password_confirm: "",
})

export function LoginPanel({
  open,
  onClose,
  initialMode = "login",
}: LoginPanelProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [mode, setMode] = useState<PanelMode>(initialMode)
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [registerForm, setRegisterForm] = useState(emptyRegisterForm)
  const [pendingEmail, setPendingEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const wasOpenRef = useRef(false)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (open) {
      const justOpened = !wasOpenRef.current
      wasOpenRef.current = true
      setVisible(true)

      // Only seed mode/forms when the panel opens — not on every parent re-render.
      // Otherwise verify_pending flashes and snaps back to login.
      if (justOpened) {
        setMode(initialMode)
        setError(null)
        setInfo(null)
      }

      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"

      function onKey(e: KeyboardEvent) {
        if (e.key === "Escape") onCloseRef.current()
      }
      window.addEventListener("keydown", onKey)

      return () => {
        document.body.style.overflow = prev
        window.removeEventListener("keydown", onKey)
      }
    }

    wasOpenRef.current = false
    const timer = window.setTimeout(() => {
      setVisible(false)
      setLoginEmail("")
      setLoginPassword("")
      setRegisterForm(emptyRegisterForm())
      setPendingEmail("")
      setMode("login")
      setError(null)
      setInfo(null)
    }, 320)
    return () => window.clearTimeout(timer)
  }, [open, initialMode])

  if (!open && !visible) return null

  function switchMode(next: "login" | "register") {
    setError(null)
    setInfo(null)
    setMode(next)
  }

  function showVerifyPending(email: string, message?: string) {
    setPendingEmail(email)
    setInfo(message || null)
    setError(null)
    setMode("verify_pending")
  }

  async function persistGuestFavoritesToAccount() {
    const local = readFavorites()
    if (local.length === 0) return
    await syncWishlistAction(local.map(toWishlistInput))
  }

  function onLoginSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const result = await loginAction(loginEmail, loginPassword)
      if (!result.ok) {
        if (result.code === "unverified") {
          showVerifyPending(result.email || loginEmail, result.message)
          return
        }
        setError(result.message)
        return
      }
      await persistGuestFavoritesToAccount()
      onClose()
      router.refresh()
      router.push("/hesabim")
    })
  }

  function onRegisterSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (registerForm.password.length < AUTH_PASSWORD_MIN_LENGTH) {
      setError(authPasswordTooShortMessage())
      return
    }
    if (registerForm.password !== registerForm.password_confirm) {
      setError("Şifreler eşleşmiyor.")
      return
    }

    startTransition(async () => {
      const result = await registerAction(registerForm)
      if (!result.ok) {
        setError(result.message)
        if (/zaten bir hesap var/i.test(result.message)) {
          setLoginEmail(registerForm.email)
        }
        return
      }
      if ("needs_verification" in result && result.needs_verification) {
        showVerifyPending(result.email, result.message)
        return
      }
      await persistGuestFavoritesToAccount()
      onClose()
      router.refresh()
      router.push("/hesabim")
    })
  }

  function onResend() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const result = await resendVerificationAction({
        email: pendingEmail || loginEmail || registerForm.email,
        password: loginPassword || registerForm.password || undefined,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.message === "Hesabınız zaten doğrulanmış.") {
        onClose()
        router.refresh()
        router.push("/hesabim")
        return
      }
      setInfo(result.message || "Doğrulama maili gönderildi.")
    })
  }

  const title =
    mode === "login"
      ? "Giriş Yap"
      : mode === "register"
        ? "Kayıt Ol"
        : "E-posta Doğrulama"

  return (
    <div
      className={`${styles.overlay} ${open ? styles.overlayOpen : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={!open}
    >
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Kapat"
        tabIndex={open ? 0 : -1}
        onClick={onClose}
      />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.close}
            aria-label="Kapat"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          {mode === "verify_pending" ? (
            <div
              className={`${styles.form} ${styles.modeContent}`}
              data-testid="register-pending"
            >
              <p className={styles.pendingLead}>
                Hesabınızı kullanmadan önce e-posta adresinizi doğrulamanız
                gerekiyor. Gelen kutunuzu (ve spam klasörünü) kontrol edin.
              </p>
              {pendingEmail ? (
                <p className={styles.pendingEmail}>{pendingEmail}</p>
              ) : null}
              {info ? <p className={styles.info}>{info}</p> : null}
              {error ? <p className={styles.error}>{error}</p> : null}
              <button
                type="button"
                className={styles.submit}
                disabled={pending}
                onClick={onResend}
              >
                {pending ? "Gönderiliyor…" : "Mail gelmedi mi? Tekrar gönder"}
              </button>
              <button
                type="button"
                className={styles.modeSwitch}
                onClick={() => switchMode("login")}
              >
                Giriş Yap
              </button>
            </div>
          ) : null}

          {mode === "login" ? (
            <form
              key="login"
              className={`${styles.form} ${styles.modeContent}`}
              onSubmit={onLoginSubmit}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-email">
                  E-posta
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-password">
                  Şifre
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  className={styles.input}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>

              {error ? <p className={styles.error}>{error}</p> : null}

              <button
                type="submit"
                data-testid="login-submit"
                className={styles.submit}
                disabled={pending}
              >
                {pending ? "Giriş yapılıyor…" : "Giriş Yap"}
              </button>

              <div className={styles.footerLinks}>
                <Link
                  href="/forgot-password"
                  className={styles.forgot}
                  onClick={onClose}
                >
                  Şifreni mi unuttun?
                </Link>
                <button
                  type="button"
                  className={styles.modeSwitch}
                  onClick={() => switchMode("register")}
                >
                  Hesabın yok mu? Kayıt Ol
                </button>
              </div>
            </form>
          ) : null}

          {mode === "register" ? (
            <form
              key="register"
              className={`${styles.form} ${styles.modeContent}`}
              onSubmit={onRegisterSubmit}
            >
              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-first">
                  Ad
                </label>
                <input
                  id="reg-first"
                  className={styles.input}
                  autoComplete="given-name"
                  value={registerForm.first_name}
                  onChange={(e) =>
                    setRegisterForm((f) => ({
                      ...f,
                      first_name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-last">
                  Soyad
                </label>
                <input
                  id="reg-last"
                  className={styles.input}
                  autoComplete="family-name"
                  value={registerForm.last_name}
                  onChange={(e) =>
                    setRegisterForm((f) => ({
                      ...f,
                      last_name: e.target.value,
                    }))
                  }
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-email">
                  E-posta
                </label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  value={registerForm.email}
                  onChange={(e) =>
                    setRegisterForm((f) => ({ ...f, email: e.target.value }))
                  }
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-password">
                  Şifre
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={AUTH_PASSWORD_MIN_LENGTH}
                  className={styles.input}
                  value={registerForm.password}
                  onChange={(e) =>
                    setRegisterForm((f) => ({ ...f, password: e.target.value }))
                  }
                  required
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="reg-password-confirm">
                  Şifre (tekrar)
                </label>
                <input
                  id="reg-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={AUTH_PASSWORD_MIN_LENGTH}
                  className={styles.input}
                  value={registerForm.password_confirm}
                  onChange={(e) =>
                    setRegisterForm((f) => ({
                      ...f,
                      password_confirm: e.target.value,
                    }))
                  }
                  required
                />
              </div>

              {error ? (
                <div className={styles.errorBlock} data-testid="register-error">
                  <p className={styles.error}>{error}</p>
                  {/zaten bir hesap var/i.test(error) ? (
                    <button
                      type="button"
                      className={styles.errorAction}
                      onClick={() => switchMode("login")}
                    >
                      Giriş yap
                    </button>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                data-testid="register-submit"
                className={styles.submit}
                disabled={pending}
              >
                {pending ? "Kayıt oluşturuluyor…" : "Kayıt Ol"}
              </button>

              <button
                type="button"
                className={styles.modeSwitch}
                onClick={() => switchMode("login")}
              >
                Zaten hesabın var mı? Giriş Yap
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  )
}
