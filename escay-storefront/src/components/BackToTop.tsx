"use client"

import { useEffect, useState } from "react"

const SHOW_AFTER_PX = 400

export function BackToTop() {
  const [visible, setVisible] = useState(false)
  const [overFooter, setOverFooter] = useState(false)

  useEffect(() => {
    function update() {
      setVisible(window.scrollY > SHOW_AFTER_PX)

      const footer = document.querySelector(".site-footer")
      if (!footer) {
        setOverFooter(false)
        return
      }

      const footerTop = footer.getBoundingClientRect().top
      const triggerY = window.innerHeight - 96
      setOverFooter(footerTop < triggerY)
    }

    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

  return (
    <button
      type="button"
      className={`back-to-top${visible ? " is-visible" : ""}${overFooter ? " is-over-footer" : ""}`}
      aria-label="Sayfanın başına dön"
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  )
}
