"use client"

import { useEffect, useRef, useState } from "react"
import type { CartAddedPayload } from "@/lib/cart-events"

const HIDE_AFTER_MS = 3200
/** Absolute max lifetime — hover pause cannot keep the toast forever. */
const HARD_MAX_MS = 5000

export function useProductToast(eventName: string) {
  const [visible, setVisible] = useState(false)
  const [item, setItem] = useState<CartAddedPayload | null>(null)
  const hideTimer = useRef<number | undefined>(undefined)
  const hardTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    function clearSoftHide() {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      hideTimer.current = undefined
    }

    function clearHardHide() {
      if (hardTimer.current) window.clearTimeout(hardTimer.current)
      hardTimer.current = undefined
    }

    function hide() {
      clearSoftHide()
      clearHardHide()
      setVisible(false)
    }

    function scheduleHide(delay = HIDE_AFTER_MS) {
      clearSoftHide()
      hideTimer.current = window.setTimeout(hide, delay)
    }

    function onAdded(event: Event) {
      const detail = (event as CustomEvent<CartAddedPayload>).detail || {}
      setItem(detail)
      setVisible(true)
      scheduleHide()
      clearHardHide()
      hardTimer.current = window.setTimeout(hide, HARD_MAX_MS)
    }

    window.addEventListener(eventName, onAdded)
    return () => {
      window.removeEventListener(eventName, onAdded)
      clearSoftHide()
      clearHardHide()
    }
  }, [eventName])

  function pauseHide() {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = undefined
  }

  function resumeHide() {
    if (hideTimer.current) window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setVisible(false), 1400)
  }

  return { visible, item, pauseHide, resumeHide }
}
