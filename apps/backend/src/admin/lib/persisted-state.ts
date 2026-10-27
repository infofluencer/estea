import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react"

/**
 * Admin sayfalarından başka sayfaya gidip geri dönünce filtre / seçim / sayfa
 * kaybolmasın diye state'i sessionStorage'da tutar. Sekmeye özel; sekme kapanınca silinir.
 */
const PREFIX = "escay-admin:"

type Stored = { set: unknown[] } | { value: unknown }

const encode = (value: unknown): Stored =>
  value instanceof Set ? { set: [...value] } : { value }

const decode = (raw: Stored): unknown => ("set" in raw ? new Set(raw.set) : raw.value)

const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const value = decode(JSON.parse(raw) as Stored)
    // Kayıtlı tip beklenenden farklıysa (eski sürüm vs.) varsayılana dön.
    if ((fallback instanceof Set) !== (value instanceof Set)) return fallback
    if (!(fallback instanceof Set) && fallback != null && typeof value !== typeof fallback) return fallback
    return value as T
  } catch {
    return fallback
  }
}

const write = (key: string, value: unknown) => {
  try {
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(encode(value)))
  } catch {
    // Depolama kapalı / dolu: state yine bellekte çalışır.
  }
}

/** useState ile aynı; değer sayfadan çıkıp dönünce korunur. Set de desteklenir. */
export function usePersistedState<T>(key: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() =>
    read(key, typeof initial === "function" ? (initial as () => T)() : initial)
  )
  useEffect(() => {
    write(key, value)
  }, [key, value])
  return [value, setValue]
}

const scrollParent = (el: HTMLElement | null): HTMLElement => {
  let node = el?.parentElement ?? null
  while (node) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === "auto" || overflowY === "scroll") return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement
}

/**
 * Sayfaya geri dönünce kaydırma konumunu geri yükler. `ready` veri yüklenince true olmalı
 * (liste yüksekliği oluşmadan kaydırılamaz). Kullanıcı kendisi kaydırırsa geri yükleme bırakılır.
 */
export function useScrollRestore(key: string, ref: RefObject<HTMLElement | null>, ready: boolean) {
  const restored = useRef(false)
  const storageKey = `scroll:${key}`

  const save = useCallback((top: number) => write(storageKey, top), [storageKey])

  useEffect(() => {
    const target = scrollParent(ref.current)
    const scroller: HTMLElement | Window =
      target === document.scrollingElement || target === document.documentElement ? window : target
    let frame = 0
    const onScroll = () => {
      if (!restored.current) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => save(target.scrollTop))
    }
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      scroller.removeEventListener("scroll", onScroll)
    }
  }, [ref, save])

  useEffect(() => {
    if (!ready || restored.current) return
    const top = read<number>(storageKey, 0)
    const target = scrollParent(ref.current)
    if (!top) {
      restored.current = true
      return
    }
    // İçerik (ör. Medusa'nın kendi tablosu) geç yüklenebilir: ~2 sn boyunca hedefe ulaşmayı dene.
    let cancelled = false
    const started = Date.now()
    const stop = () => {
      cancelled = true
      restored.current = true
    }
    const userEvents = ["wheel", "touchstart", "keydown", "mousedown"] as const
    userEvents.forEach((e) => window.addEventListener(e, stop, { once: true, passive: true }))
    const tick = () => {
      if (cancelled) return
      target.scrollTop = top
      if (Math.abs(target.scrollTop - top) < 2 || Date.now() - started > 2000) {
        stop()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    return () => {
      cancelled = true
      userEvents.forEach((e) => window.removeEventListener(e, stop))
    }
  }, [ready, ref, storageKey])
}
