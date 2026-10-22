import type { ReactNode } from "react"
import { LEGAL_UPDATED_AT } from "@/lib/legal"
import styles from "./legal.module.css"

export function LegalLayout({
  title,
  updatedAt = LEGAL_UPDATED_AT,
  notice,
  children,
}: {
  title: string
  updatedAt?: string
  notice?: ReactNode
  children: ReactNode
}) {
  return (
    <div className={`page-shell ${styles.wrap}`}>
      <header className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updated}>Son güncelleme: {updatedAt}</p>
      </header>
      {notice ? <div className={styles.placeholder}>{notice}</div> : null}
      <div className={styles.prose}>{children}</div>
    </div>
  )
}
