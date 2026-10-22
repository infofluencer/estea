"use client"

import { useState } from "react"
import { formatTry } from "@/lib/medusa"
import type { BankTransferInfo } from "@/lib/payment"
import styles from "./bank-transfer-box.module.css"

/**
 * Ödemesi beklenen havale siparişi — banka uygulamasına girilecek alanlar
 * (alıcı, IBAN, tutar, açıklama) form sırasıyla + sonrası için 3 adım.
 * Veri store sipariş yanıtındaki `bank_transfer` alanından gelir; ödeme
 * onaylanınca backend alanı null döner ve kutu kaybolur.
 */
export function BankTransferBox({
  info,
  total,
  orderNo,
}: {
  info: BankTransferInfo
  total: number
  orderNo: string
}) {
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      window.setTimeout(() => setCopied((k) => (k === key ? null : k)), 2000)
    } catch {
      /* clipboard izni yok — kullanıcı elle seçer */
    }
  }

  const amount = formatTry(total)
  const fields: {
    key: string
    label: string
    value: string
    copyValue: string
    variant?: "iban" | "amount"
    half?: boolean
  }[] = [
    { key: "name", label: "Alıcı", value: info.account_name, copyValue: info.account_name },
    { key: "iban", label: "IBAN", value: info.iban, copyValue: info.iban.replace(/\s+/g, ""), variant: "iban" },
    {
      key: "amount",
      label: "Tutar",
      value: amount,
      copyValue: total.toFixed(2).replace(".", ","),
      variant: "amount",
      half: true,
    },
    { key: "desc", label: "Açıklama", value: `#${orderNo}`, copyValue: orderNo, half: true },
  ]

  return (
    <section className={styles.card} aria-labelledby="bank-transfer-title" data-testid="bank-transfer-box">
      <header className={styles.head}>
        <h2 id="bank-transfer-title" className={styles.title}>
          Havale ile ödeme
        </h2>
        {info.bank_name ? <span className={styles.bank}>{info.bank_name}</span> : null}
      </header>

      <dl className={styles.fields}>
        {fields.map((f) => (
          <div
            key={f.key}
            className={`${styles.field} ${f.half ? styles.fieldHalf : ""}`}
          >
            <dt className={styles.label}>{f.label}</dt>
            <dd className={styles.valueRow}>
              <span
                className={
                  f.variant === "iban"
                    ? styles.iban
                    : f.variant === "amount"
                      ? styles.amount
                      : styles.value
                }
              >
                {f.value}
              </span>
              <button
                type="button"
                className={styles.copy}
                onClick={() => void copy(f.key, f.copyValue)}
                aria-label={`${f.label} kopyala`}
              >
                {copied === f.key ? (
                  <>
                    <CheckIcon />
                    <span className={styles.copied}>Kopyalandı</span>
                  </>
                ) : (
                  <CopyIcon />
                )}
              </button>
            </dd>
          </div>
        ))}
      </dl>

      <ol className={styles.steps}>
        <li>
          <span className={styles.stepNo}>1</span>
          <span>Açıklamaya sipariş numaranızı yazarak tutarın tamamını gönderin.</span>
        </li>
        <li>
          <span className={styles.stepNo}>2</span>
          <span>Ödemeniz hesabımıza geçince kontrol edip onaylarız.</span>
        </li>
        <li>
          <span className={styles.stepNo}>3</span>
          <span>Onay e-postasıyla siparişiniz hazırlanmaya başlar.</span>
        </li>
      </ol>
    </section>
  )
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.5 3.5v-1a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
