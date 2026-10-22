"use client"

import { useId, type ReactNode } from "react"
import styles from "./product.module.css"

export function ProductAccordion({
  itemId,
  open,
  onToggle,
  title,
  icon,
  children,
}: {
  itemId: string
  open: boolean
  onToggle: (id: string) => void
  title: string
  icon?: ReactNode
  children: ReactNode
}) {
  const panelId = useId()

  return (
    <div className={styles.accordion}>
      <button
        type="button"
        className={styles.accordionTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => onToggle(itemId)}
      >
        <span className={styles.accordionTitle}>
          {icon ? <span className={styles.accordionGlyph}>{icon}</span> : null}
          <span>{title}</span>
        </span>
        <span
          className={`${styles.accordionIcon}${open ? ` ${styles.accordionIconOpen}` : ""}`}
          aria-hidden
        />
      </button>
      <div
        id={panelId}
        className={`${styles.accordionPanel}${open ? ` ${styles.accordionPanelOpen}` : ""}`}
        hidden={!open}
      >
        {children}
      </div>
    </div>
  )
}
