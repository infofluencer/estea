"use client"

import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { refreshViewportDetection } from "./DeferredImage"

const MIN_MS = 450
const DEFAULT_MAX_MS = 2800
const SETTLE_MS = 180

type RouteWaitConfig = {
  contentSelector: string
  maxMs: number
  skipImages?: boolean
}

function routeWaitConfig(pathname: string): RouteWaitConfig | null {
  if (pathname.startsWith("/urun-kategori")) {
    return {
      contentSelector:
        '[data-page-content="categories"], [data-page-content="categories-loading"]',
      maxMs: DEFAULT_MAX_MS,
      skipImages: true,
    }
  }
  return null
}

function imageReady(img: HTMLImageElement) {
  return img.complete && img.naturalWidth > 0
}

function collectCriticalImages() {
  return Array.from(document.images).filter((img) => {
    if (img.closest("[data-page-loader]")) return false
    const src = img.currentSrc || img.src
    if (!src || src.startsWith("data:image/gif")) return false
    if (img.loading === "lazy") return false
    if (
      img.closest(".site-header") ||
      img.closest("[class*='hero']") ||
      img.getAttribute("data-loader-critical") === "1"
    ) {
      return true
    }
    const rect = img.getBoundingClientRect()
    if (rect.top < window.innerHeight * 0.85 && rect.bottom > 0) return true
    return false
  })
}

function waitForSelector(
  selector: string,
  signal: { cancelled: boolean },
  maxMs: number
) {
  return new Promise<boolean>((resolve) => {
    const started = performance.now()

    const check = () => {
      if (signal.cancelled) {
        resolve(false)
        return
      }
      if (document.querySelector(selector)) {
        resolve(true)
        return
      }
      if (performance.now() - started >= maxMs) {
        resolve(false)
        return
      }
      requestAnimationFrame(check)
    }

    check()
  })
}

function waitForImages(
  onProgress: (ratio: number) => void,
  signal: { cancelled: boolean },
  route: RouteWaitConfig | null
) {
  return new Promise<void>((resolve) => {
    let settledTimer: ReturnType<typeof setTimeout> | null = null
    let maxTimer: ReturnType<typeof setTimeout> | null = null
    let observers: MutationObserver | null = null
    const pending = new Set<HTMLImageElement>()
    const seen = new WeakSet<HTMLImageElement>()
    let total = 0
    let loaded = 0
    const maxMs = route?.maxMs ?? DEFAULT_MAX_MS

    const finish = () => {
      if (signal.cancelled) return
      if (settledTimer) clearTimeout(settledTimer)
      if (maxTimer) clearTimeout(maxTimer)
      observers?.disconnect()
      window.removeEventListener("load", onWindowLoad)
      onProgress(1)
      resolve()
    }

    const report = () => {
      if (signal.cancelled) return
      const ratio = total === 0 ? 0 : loaded / total
      onProgress(Math.min(0.98, ratio))
      if (total > 0 && loaded >= total) {
        if (settledTimer) clearTimeout(settledTimer)
        settledTimer = setTimeout(finish, SETTLE_MS)
      }
    }

    const track = (img: HTMLImageElement) => {
      if (seen.has(img) || signal.cancelled) return
      seen.add(img)
      total += 1
      if (imageReady(img)) {
        loaded += 1
        report()
        return
      }
      pending.add(img)
      let settled = false
      const done = () => {
        if (settled || !pending.has(img)) return
        settled = true
        pending.delete(img)
        img.removeEventListener("load", done)
        img.removeEventListener("error", done)
        loaded += 1
        report()
      }
      img.addEventListener("load", done)
      img.addEventListener("error", done)
      report()
    }

    const scan = () => {
      for (const img of collectCriticalImages()) track(img)
    }

    const onWindowLoad = () => {
      scan()
    }

    const run = async () => {
      if (route) {
        await waitForSelector(route.contentSelector, signal, maxMs)
        if (signal.cancelled) return
        if (route.skipImages) {
          finish()
          return
        }
      }

      scan()
      requestAnimationFrame(scan)
      setTimeout(scan, 120)
      setTimeout(scan, 320)
      setTimeout(scan, 700)

      window.addEventListener("load", onWindowLoad)

      observers = new MutationObserver(() => {
        if (signal.cancelled) return
        scan()
      })
      observers.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["src", "srcset"],
      })

      maxTimer = setTimeout(finish, maxMs)

      if (!route) {
        setTimeout(() => {
          if (signal.cancelled) return
          if (total === 0 || pending.size === 0) finish()
        }, Math.max(MIN_MS, SETTLE_MS + 120))
      }
    }

    void run()
  })
}

export function PageLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(0.12)
  const runId = useRef(0)

  useEffect(() => {
    const id = ++runId.current
    const signal = { cancelled: false }
    const started = performance.now()
    const route = routeWaitConfig(pathname)
    let raf = 0
    let displayProgress = 0.12

    setVisible(true)
    setExiting(false)
    setProgress(0.12)
    document.documentElement.classList.add("escay-loading")
    document.documentElement.style.overflow = "hidden"

    let targetProgress = 0.12

    const tick = () => {
      if (signal.cancelled || id !== runId.current) return
      displayProgress += (targetProgress - displayProgress) * 0.16
      if (targetProgress >= 1 && displayProgress > 0.995) {
        displayProgress = 1
      }
      setProgress(displayProgress)
      if (displayProgress < 1 || targetProgress < 1) {
        raf = requestAnimationFrame(tick)
      }
    }
    raf = requestAnimationFrame(tick)

    ;(async () => {
      await waitForImages((ratio) => {
        if (signal.cancelled || id !== runId.current) return
        targetProgress = Math.max(targetProgress, 0.15 + ratio * 0.82)
      }, signal, route)

      if (signal.cancelled || id !== runId.current) return

      const elapsed = performance.now() - started
      if (elapsed < MIN_MS) {
        await new Promise((r) => setTimeout(r, MIN_MS - elapsed))
      }
      if (signal.cancelled || id !== runId.current) return

      targetProgress = 1
      setProgress(1)
      setExiting(true)
      await new Promise((r) => setTimeout(r, 280))
      if (signal.cancelled || id !== runId.current) return

      setVisible(false)
      document.documentElement.classList.remove("escay-loading")
      document.documentElement.style.overflow = ""
      requestAnimationFrame(() => {
        requestAnimationFrame(refreshViewportDetection)
      })
    })()

    return () => {
      signal.cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [pathname])

  const fill = Math.round(Math.min(100, Math.max(0, progress * 100)))

  return (
    <div
      data-page-loader
      className={`page-loader${exiting ? " is-exiting" : ""}${!visible ? " is-done" : ""}`}
      aria-busy={visible}
      aria-live="polite"
      aria-label="Sayfa yükleniyor"
      aria-hidden={!visible}
    >
      <p className="page-loader__brand" aria-hidden="true">
        <span className="page-loader__brand-base">ES ÇAY</span>
        <span
          className="page-loader__brand-fill"
          style={{ clipPath: `inset(0 ${100 - fill}% 0 0)` }}
        >
          ES ÇAY
        </span>
      </p>
    </div>
  )
}
