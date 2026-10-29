"use client"

import Image from "next/image"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"

export type HeroSlide = {
  image: string
  alt: string
  /** Fotoğrafın kadrajı (object-position); dar ekranda özne ortada kalsın. */
  focus?: string
  title: string
  lead: string
  /** `info`: satın alma olmayan hedef (ör. Hakkımızda) — kırmızı yalnız satın almaya ayrılır. */
  cta: { label: string; href: string; info?: boolean }
  /** Slayt sekmesindeki kısa ad. */
  tab: string
}

const INTERVAL_MS = 6500
const SWIPE_PX = 48

export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = slides.length

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count])

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReduced(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (paused || reduced || count < 2) return
    const timer = window.setTimeout(() => go(index + 1), INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [index, paused, reduced, count, go])

  if (!count) return null

  return (
    <section
      className="hero-slider"
      aria-roledescription="carousel"
      aria-label="Öne çıkanlar"
      data-paused={paused || reduced ? "" : undefined}
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false)
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchX.current
        touchX.current = null
        const end = e.changedTouches[0]?.clientX
        if (start == null || end == null) return
        const dx = end - start
        if (Math.abs(dx) > SWIPE_PX) go(dx < 0 ? index + 1 : index - 1)
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1)
        if (e.key === "ArrowLeft") go(index - 1)
      }}
    >
      <div className="hero-slider__track">
        {slides.map((s, i) => {
          const active = i === index
          return (
            <div
              key={s.image}
              className="hero-slider__slide"
              data-active={active ? "" : undefined}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${count}: ${s.tab}`}
              aria-hidden={!active}
            >
              <Image
                src={s.image}
                alt={s.alt}
                fill
                priority={i === 0}
                sizes="100vw"
                className="hero-slider__img"
                style={{ objectPosition: s.focus || "50% 50%" }}
              />
              <div className="hero-slider__scrim" aria-hidden />
              <div className="hero-slider__copy">
                {i === 0 ? <h1 className="hero-slider__title">{s.title}</h1> : <h2 className="hero-slider__title">{s.title}</h2>}
                <p className="hero-slider__lead">{s.lead}</p>
                <Link
                  href={s.cta.href}
                  className={`hero-slider__cta${s.cta.info ? " hero-slider__cta--info" : ""}`}
                  tabIndex={active ? 0 : -1}
                >
                  {s.cta.label}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path d="M3 8h9.5M8.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {count > 1 ? (
        <>
          <button type="button" className="hero-slider__arrow hero-slider__arrow--prev" aria-label="Önceki slayt" onClick={() => go(index - 1)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M12 4.5 6.5 10l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button type="button" className="hero-slider__arrow hero-slider__arrow--next" aria-label="Sonraki slayt" onClick={() => go(index + 1)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
              <path d="M8 4.5 13.5 10 8 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="hero-slider__dots" role="tablist" aria-label="Slaytlar">
            {slides.map((s, i) => (
              <button
                key={s.image}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={s.tab}
                className="hero-slider__dot"
                onClick={() => go(i)}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
