"use client"

import { useState, type ReactNode } from "react"
import styles from "./legal.module.css"

export function CookieTableDisclosure({
  showLabel,
  hideLabel,
  children,
}: {
  showLabel: string
  hideLabel: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className={styles.disclosure}>
      <button
        type="button"
        className={styles.disclosureBtn}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{open ? hideLabel : showLabel}</span>
        <span className={styles.disclosureChevron} aria-hidden>
          {open ? "−" : "+"}
        </span>
      </button>
      <div
        className={`${styles.disclosurePanel}${open ? ` ${styles.disclosurePanelOpen}` : ""}`}
      >
        <div className={styles.disclosureInner}>{children}</div>
      </div>
    </div>
  )
}
