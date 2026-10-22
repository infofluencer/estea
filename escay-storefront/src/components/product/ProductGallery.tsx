"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react"
import styles from "./product.module.css"

const LOOP_SETS = 3
/** Give up waiting on slow probes; anything still pending is shown optimistically. */
const PROBE_TIMEOUT_MS = 2500

/**
 * Variant galleries are guessed (`-01` … `-04`), so some URLs 404. Probe them
 * before laying out the gallery — otherwise it renders as a multi-image
 * carousel and then collapses to a single image once the misses error out.
 */
function useVerifiedImages(
  images: string[]
): { urls: string[]; ratio: number | null } | null {
  const key = images.join("\n")
  const [verified, setVerified] = useState<{
    key: string
    urls: string[]
    ratio: number | null
  } | null>(null)

  useEffect(() => {
    const urls = [...new Set(key.split("\n").filter(Boolean))]
    const status = new Map<string, boolean | undefined>()
    const ratios = new Map<string, number>()
    let done = false

    function finish() {
      if (done) return
      done = true
      window.clearTimeout(timer)
      const ok = urls.filter((u) => status.get(u) !== false)
      const first = ok.find((u) => ratios.has(u))
      setVerified({ key, urls: ok, ratio: first ? ratios.get(first)! : null })
    }

    function settle(url: string, ok: boolean) {
      status.set(url, ok)
      if (urls.every((u) => status.get(u) !== undefined)) finish()
    }

    const timer = window.setTimeout(finish, PROBE_TIMEOUT_MS)
    const probes = urls.map((url) => {
      const img = new Image()
      img.onload = () => {
        if (img.naturalWidth && img.naturalHeight) {
          ratios.set(url, img.naturalWidth / img.naturalHeight)
        }
        settle(url, true)
      }
      img.onerror = () => settle(url, false)
      img.src = url
      return img
    })
    if (!urls.length) finish()

    return () => {
      done = true
      window.clearTimeout(timer)
      probes.forEach((img) => {
        img.onload = null
        img.onerror = null
      })
    }
  }, [key])

  // Keep showing the previous gallery while a new color's images are probed.
  return verified
}

export function ProductGallery({
  images,
  productTitle,
  square = false,
}: {
  images: string[]
  productTitle: string
  square?: boolean
}) {
  const verified = useVerifiedImages(images)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [activeIndex, setActiveIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const thumbRefs = useRef<(HTMLButtonElement | null)[]>([])
  const dragRef = useRef({ active: false, startX: 0, scrollLeft: 0 })
  const normalizingRef = useRef(false)

  const tiles = useMemo(
    () => (verified?.urls ?? []).filter((src) => !hidden.has(src)),
    [verified, hidden]
  )

  const isLoop = tiles.length > 1

  const loopTiles = useMemo(() => {
    if (!isLoop) return tiles
    return Array.from({ length: LOOP_SETS }, () => tiles).flat()
  }, [isLoop, tiles])

  const safeIndex = Math.min(activeIndex, Math.max(tiles.length - 1, 0))

  function scrollToMiddleSet(behavior: ScrollBehavior = "auto") {
    const el = scrollRef.current
    if (!el || !isLoop) return
    const middleStart = slideRefs.current[tiles.length]
    if (!middleStart) return
    el.scrollTo({ left: middleStart.offsetLeft, behavior })
  }

  function normalizeLoopScroll() {
    const el = scrollRef.current
    if (!el || !isLoop || normalizingRef.current) return

    const n = tiles.length
    const middleStart = slideRefs.current[n]
    const nextSetStart = slideRefs.current[n * 2]
    if (!middleStart || !nextSetStart) return

    const loopWidth = nextSetStart.offsetLeft - middleStart.offsetLeft
    if (loopWidth <= 0) return

    let nextLeft = el.scrollLeft

    if (el.scrollLeft >= nextSetStart.offsetLeft - 1) {
      nextLeft = el.scrollLeft - loopWidth
    } else if (el.scrollLeft < middleStart.offsetLeft - 1) {
      nextLeft = el.scrollLeft + loopWidth
    }

    if (nextLeft === el.scrollLeft) return

    normalizingRef.current = true
    el.scrollLeft = nextLeft
    normalizingRef.current = false
  }

  useEffect(() => {
    setHidden(new Set())
    setActiveIndex(0)
  }, [verified])

  useEffect(() => {
    requestAnimationFrame(() => {
      if (isLoop) scrollToMiddleSet()
      else scrollRef.current?.scrollTo({ left: 0 })
    })
  }, [tiles, isLoop])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current.active) return
      e.preventDefault()
      if (!scrollRef.current) return
      const dx = e.pageX - dragRef.current.startX
      scrollRef.current.style.scrollSnapType = "none"
      scrollRef.current.scrollLeft = dragRef.current.scrollLeft - dx
      if (isLoop) normalizeLoopScroll()
    }

    function onUp() {
      const el = scrollRef.current
      if (el) el.style.scrollSnapType = ""
      if (dragRef.current.active && isLoop) {
        normalizeLoopScroll()
      }
      dragRef.current.active = false
      setDragging(false)
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [isLoop, tiles.length, loopTiles.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || tiles.length === 0) return

    function syncActiveFromScroll() {
      if (normalizingRef.current) return

      const anchor = el!.scrollLeft + 8
      let bestLoopIndex = 0
      let bestOffset = Number.POSITIVE_INFINITY

      slideRefs.current.forEach((slide, index) => {
        if (!slide) return
        const offset = Math.abs(slide.offsetLeft - anchor)
        if (offset < bestOffset) {
          bestOffset = offset
          bestLoopIndex = index
        }
      })

      const nextIndex = isLoop ? bestLoopIndex % tiles.length : bestLoopIndex
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex))

      if (isLoop) normalizeLoopScroll()
    }

    el.addEventListener("scroll", syncActiveFromScroll, { passive: true })
    return () => el.removeEventListener("scroll", syncActiveFromScroll)
  }, [isLoop, tiles])

  useEffect(() => {
    thumbRefs.current[safeIndex]?.scrollIntoView({
      behavior: "smooth",
      inline: "nearest",
      block: "nearest",
    })
  }, [safeIndex])

  function goToSlide(index: number) {
    const el = scrollRef.current
    if (!el) return
    setActiveIndex(index)
    const targetIndex = isLoop ? tiles.length + index : index
    const target = slideRefs.current[targetIndex]
    if (!target) return
    el.scrollTo({ left: target.offsetLeft, behavior: "smooth" })
  }

  if (verified === null) {
    // Same footprint as the final gallery so the page doesn't jump.
    return (
      <div
        className={`${styles.galleryWrap}${square ? ` ${styles.galleryWrapSquare}` : ""}`}
        aria-busy="true"
      >
        <div className={styles.galleryScroll}>
          <div className={styles.galleryPlaceholder} />
        </div>
      </div>
    )
  }

  if (!tiles.length) return null

  function onMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    dragRef.current = {
      active: true,
      startX: e.pageX,
      scrollLeft: scrollRef.current?.scrollLeft ?? 0,
    }
    setDragging(true)
  }

  const isSingle = tiles.length === 1

  return (
    <div
      className={`${styles.galleryWrap}${isSingle ? ` ${styles.galleryWrapSingle}` : ""}${square ? ` ${styles.galleryWrapSquare}` : ""}`}
      // Frame follows the shot (square scarves vs 9:16 lifestyle) so contain
      // doesn't pad square images with a tall empty band.
      style={
        verified?.ratio
          ? ({ "--slide-ratio": String(verified.ratio) } as CSSProperties)
          : undefined
      }
    >
      <div
        ref={scrollRef}
        className={`${styles.galleryScroll}${dragging ? ` ${styles.galleryScrollDragging}` : ""}`}
        aria-label={`${productTitle} görselleri`}
        role="list"
        onMouseDown={isSingle ? undefined : onMouseDown}
      >
        <div ref={trackRef} className={styles.galleryTrack}>
          {loopTiles.map((src, index) => (
            <div
              key={`${index}-${src}`}
              ref={(el) => {
                slideRefs.current[index] = el
              }}
              className={styles.gallerySlide}
              role="listitem"
              aria-hidden={
                isLoop ? index < tiles.length || index >= tiles.length * 2 : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`${productTitle} ${(index % tiles.length) + 1}`}
                className={styles.galleryImg}
                loading={index % tiles.length < 3 ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={index === tiles.length ? "high" : "auto"}
                draggable={false}
                onError={() =>
                  setHidden((prev) => {
                    if (prev.has(src)) return prev
                    const next = new Set(prev)
                    next.add(src)
                    return next
                  })
                }
              />
            </div>
          ))}
        </div>
      </div>

      {tiles.length > 1 ? (
        <div className={styles.thumbsRow} role="list" aria-label="Görsel önizlemeleri">
          {tiles.map((src, index) => (
            <button
              key={src}
              type="button"
              role="listitem"
              ref={(el) => {
                thumbRefs.current[index] = el
              }}
              className={`${styles.thumb}${index === safeIndex ? ` ${styles.thumbSelected}` : ""}`}
              aria-label={`${productTitle} görsel ${index + 1}`}
              aria-current={index === safeIndex ? "true" : undefined}
              onClick={() => goToSlide(index)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <span className={styles.thumbMedia}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className={styles.thumbImg}
                  loading={index < 5 ? "eager" : "lazy"}
                  decoding="async"
                  draggable={false}
                  onError={() =>
                    setHidden((prev) => {
                      if (prev.has(src)) return prev
                      const next = new Set(prev)
                      next.add(src)
                      return next
                    })
                  }
                />
              </span>
              <span className={styles.thumbIndicator} aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
