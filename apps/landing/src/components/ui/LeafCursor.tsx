'use client'

import { useEffect, useRef } from 'react'

/** Share of the remaining distance the leaf covers each frame; lower trails more. */
const EASE = 0.14
const INTERACTIVE = 'a, button, [role="tab"], summary, label'

/**
 * Tea-leaf pointer that drifts after the mouse; over links and buttons it turns into
 * a tea glass. The leaf tip and the glass rim centre sit on the hotspot.
 * Only on fine pointers with motion allowed; everyone else keeps the system cursor.
 */
export default function LeafCursor() {
  const ref = useRef<HTMLDivElement>(null)
  const leafRef = useRef<SVGSVGElement>(null)
  const glassRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const el = ref.current
    const leaf = leafRef.current
    const glass = glassRef.current
    if (!el || !leaf || !glass) return
    if (!window.matchMedia('(pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const root = document.documentElement
    root.classList.add('leaf-cursor')

    let x = 0
    let y = 0
    let tx = 0
    let ty = 0
    let hovering = false
    let shown = false
    let raf = 0

    const tick = () => {
      x += (tx - x) * EASE
      y += (ty - y) * EASE
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      raf = requestAnimationFrame(tick)
    }

    const onMove = (e: PointerEvent) => {
      tx = e.clientX
      ty = e.clientY
      if (!shown) {
        x = tx
        y = ty
        shown = true
        el.style.opacity = '1'
      }
      const over = Boolean((e.target as Element | null)?.closest?.(INTERACTIVE))
      if (over !== hovering) {
        hovering = over
        leaf.dataset.on = String(!over)
        glass.dataset.on = String(over)
      }
    }
    const hide = () => {
      shown = false
      el.style.opacity = '0'
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', hide)
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.documentElement.removeEventListener('pointerleave', hide)
      root.classList.remove('leaf-cursor')
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed top-0 left-0 z-[100] opacity-0 transition-opacity duration-200 will-change-transform"
    >
      <svg
        ref={leafRef}
        data-on="true"
        width="30"
        height="30"
        viewBox="0 0 32 32"
        className="absolute top-0 left-0 origin-top-left drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-300 data-[on=false]:scale-50 data-[on=false]:opacity-0"
      >
        <path d="M1 1C14 1 29 9 26 25 11 27 2 15 1 1Z" fill="#467910" stroke="#fbf5e4" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M2 2Q15 12 25.5 24.5" fill="none" stroke="#92c700" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9 9.5l3-4.5M14 14l4.5-3.5M19 18.5l4.5-2" fill="none" stroke="#92c700" strokeWidth="1" strokeLinecap="round" />
        <path d="M26 25l4 5" fill="none" stroke="#467910" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <svg
        ref={glassRef}
        data-on="false"
        width="40"
        height="48"
        viewBox="0 0 40 48"
        className="absolute -top-1 -left-5 origin-top drop-shadow-[0_3px_4px_rgba(0,0,0,0.35)] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] data-[on=false]:scale-50 data-[on=false]:opacity-0"
      >
        {/* İnce belli glass with tavşan kanı tea, on a gold saucer. */}
        <path d="M9 4h22c0 9-5 12-5 18 0 6 3 9 3 14H11c0-5 3-8 3-14 0-6-5-9-5-18Z" fill="#fbf5e4" fillOpacity="0.55" />
        <path d="M10.5 11h19c-1 5-4 7.5-4 11 0 6 3 9 3 14H11.5c0-5 3-8 3-14 0-3.5-3-6-4-11Z" fill="#b43317" />
        <path d="M9 4h22c0 9-5 12-5 18 0 6 3 9 3 14H11c0-5 3-8 3-14 0-6-5-9-5-18Z" fill="none" stroke="#fbf5e4" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M13 14c1 3 3 5 3 8" fill="none" stroke="#fbf5e4" strokeOpacity="0.6" strokeWidth="1.2" strokeLinecap="round" />
        <ellipse cx="20" cy="40" rx="17" ry="4" fill="#e9ba3c" stroke="#fbf5e4" strokeWidth="1.4" />
      </svg>
    </div>
  )
}
