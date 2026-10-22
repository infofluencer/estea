"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import formStyles from "@/components/auth/auth-form.module.css"
import { COMPANY } from "@/lib/company"

export function ContactForm() {
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [kvkk, setKvkk] = useState(false)
  const [company, setCompany] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!kvkk) {
      setError("Devam etmek için KVKK bilgilendirmesini onaylayın.")
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, subject, message, company }),
        })
        const data = (await res.json()) as { ok?: boolean; message?: string }
        if (!res.ok || !data.ok) {
          setError(data.message || "Mesaj gönderilemedi.")
          return
        }
        setSuccess("Mesajınız alındı. En kısa sürede dönüş yapacağız.")
        setName("")
        setEmail("")
        setSubject("")
        setMessage("")
        setKvkk(false)
      } catch {
        setError("Mesaj gönderilemedi.")
      }
    })
  }

  return (
    <div className={formStyles.page} style={{ maxWidth: "32rem" }}>
      <header className={formStyles.head}>
        <h1 className={formStyles.title}>İletişim</h1>
        <p className={formStyles.lead}>
          Sipariş, ürün veya koleksiyon sorularınız için bize yazın.
        </p>
      </header>

      {success ? (
        <div className={formStyles.actions}>
          <p className={formStyles.success}>{success}</p>
          <a href={`mailto:${COMPANY.emailOps}`} className={formStyles.link}>
            {COMPANY.emailOps}
          </a>
        </div>
      ) : (
        <form className={formStyles.form} onSubmit={onSubmit}>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="contact-name">
              Ad
            </label>
            <input
              id="contact-name"
              className={formStyles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="contact-email">
              E-posta
            </label>
            <input
              id="contact-email"
              type="email"
              className={formStyles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="contact-subject">
              Konu
            </label>
            <input
              id="contact-subject"
              className={formStyles.input}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div className={formStyles.field}>
            <label className={formStyles.label} htmlFor="contact-message">
              Mesaj
            </label>
            <textarea
              id="contact-message"
              className={formStyles.input}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              required
              style={{ resize: "vertical", minHeight: "7rem" }}
            />
          </div>

          {/* Honeypot */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "-10000px",
              height: 0,
              overflow: "hidden",
            }}
          >
            <label htmlFor="contact-company">Company</label>
            <input
              id="contact-company"
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </div>

          <label
            className={formStyles.field}
            style={{
              display: "flex",
              gap: "0.65rem",
              alignItems: "flex-start",
              gridTemplateColumns: "none",
            }}
          >
            <input
              type="checkbox"
              checked={kvkk}
              onChange={(e) => setKvkk(e.target.checked)}
              style={{ marginTop: "0.2rem" }}
            />
            <span style={{ fontSize: "0.88rem", lineHeight: 1.5, opacity: 0.8 }}>
              <Link href="/gizlilik-politikasi">Gizlilik ve KVKK</Link>{" "}
              metnini okudum, kişisel verilerimin iletişim talebim kapsamında
              işlenmesini kabul ediyorum.
            </span>
          </label>

          {error ? <p className={formStyles.error}>{error}</p> : null}

          <div className={formStyles.actions}>
            <button
              type="submit"
              className={formStyles.submit}
              disabled={pending}
            >
              {pending ? "Gönderiliyor…" : "Gönder"}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
