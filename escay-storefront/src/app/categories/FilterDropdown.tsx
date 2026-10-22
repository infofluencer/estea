"use client"

import { useEffect, useId, useRef, useState } from "react"
import styles from "./categories.module.css"
import type { FilterOption } from "./CategoryFilterBar"

type Props = {
  label: string
  menuTitle: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  disabled?: boolean
  align?: "left" | "right"
}

export function FilterDropdown({
  label,
  menuTitle,
  value,
  options,
  onChange,
  disabled = false,
  align = "left",
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()

  const selected =
    options.find((o) => o.value === value) ||
    options.find((o) => o.value === "") ||
    options[0]

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div
      className={`${styles.filterField} ${open ? styles.filterFieldOpen : ""}`}
      ref={rootRef}
    >
      <span className={styles.filterLabel}>{label}</span>
      <button
        type="button"
        className={styles.filterTrigger}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.filterValue}>{selected?.label || "Tümü"}</span>
        <span className={styles.filterChevron} aria-hidden />
      </button>

      {open ? (
        <div
          className={`${styles.filterMenu} ${
            align === "right" ? styles.filterMenuRight : ""
          }`}
          role="listbox"
          id={listId}
          aria-label={menuTitle}
        >
          <p className={styles.filterMenuTitle}>{menuTitle}</p>
          <ul className={styles.filterMenuList}>
            {options.map((option) => {
              const isActive = option.value === (selected?.value ?? "")
              return (
                <li key={option.value || "__all"}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`${styles.filterMenuItem} ${
                      isActive ? styles.filterMenuItemActive : ""
                    }`}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <span>{option.label}</span>
                    {isActive ? (
                      <span className={styles.filterCheck} aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
