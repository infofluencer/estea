"use client"

import { useEffect, useRef, useState } from "react"

type ScrollRevealOptions = {
  rootMargin?: string
  threshold?: number
  once?: boolean
}

export function useScrollReveal<T extends HTMLElement>(
  options: ScrollRevealOptions = {}
) {
  const {
    rootMargin = "0px 0px -8% 0px",
    threshold = 0.12,
    once = true,
  } = options
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          if (once) observer.disconnect()
          return
        }

        if (!once) setVisible(false)
      },
      { rootMargin, threshold }
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [once, rootMargin, threshold])

  return { ref, visible }
}
