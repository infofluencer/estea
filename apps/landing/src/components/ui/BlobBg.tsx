'use client'

import { useEffect, useRef } from 'react'

/** Room around the button for the bulge to grow into, in px (most of it is used upward). */
const PAD = 30
/** Points sampled around the outline; the path is smoothed through them. */
const SAMPLES = 72
/** Outward push next to the pointer and inward pull on the far side, in px. */
const BULGE = 13
const SHRINK = 5
/** Extra upward swell of the top edge above the pointer, in px. */
const LIFT = 16

type Pt = [number, number]

/** Point and outward normal at arc length `s` around a w×h stadium (pill). */
function stadium(s: number, w: number, h: number): [Pt, Pt] {
  const r = h / 2
  const flat = Math.max(0, w - 2 * r)
  const arc = Math.PI * r
  if (s < flat) return [[r + s, 0], [0, -1]]
  s -= flat
  if (s < arc) {
    const a = -Math.PI / 2 + s / r
    return [[w - r + r * Math.cos(a), r + r * Math.sin(a)], [Math.cos(a), Math.sin(a)]]
  }
  s -= arc
  if (s < flat) return [[w - r - s, h], [0, 1]]
  s -= flat
  const a = Math.PI / 2 + s / r
  return [[r + r * Math.cos(a), r + r * Math.sin(a)], [Math.cos(a), Math.sin(a)]]
}

/** Closed Catmull-Rom spline through `pts` as an SVG path. */
function smoothPath(pts: Pt[]) {
  const n = pts.length
  let d = `M${pts[0][0].toFixed(2)},${pts[0][1].toFixed(2)}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
  }
  return d + 'Z'
}

/**
 * Pill-shaped button background that swells toward the pointer and pinches on
 * the far side while hovered, then eases back to a pill. Place it inside a
 * `relative isolate` element; it listens to that parent. Colour it with fill
 * classes on `className` (e.g. `fill-brand group-hover:fill-brand-dark`).
 * Wrap the button text in `.blob-label` so it squashes with the shape.
 */
export default function BlobBg({ className = '' }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    const path = pathRef.current
    const host = svg?.parentElement
    if (!svg || !path || !host) return

    const interactive =
      window.matchMedia('(pointer: fine)').matches && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0
    let h = 0
    let px = 0
    let py = 0
    let tx = 0
    let ty = 0
    let amp = 0
    let target = 0
    let raf = 0

    const draw = () => {
      const r = h / 2
      const total = 2 * Math.max(0, w - 2 * r) + 2 * Math.PI * r
      const sigma = h * 0.85
      const pts: Pt[] = []
      for (let i = 0; i < SAMPLES; i++) {
        const [[x, y], [nx, ny]] = stadium((i / SAMPLES) * total, w, h)
        const g = Math.exp(-((x - px) ** 2 + (y - py) ** 2) / (2 * sigma * sigma))
        // Top edge also rises above the pointer's x, whatever its height on the button.
        const gx = Math.exp(-((x - px) ** 2) / (2 * (sigma * 1.2) ** 2))
        const lift = ny < 0 ? LIFT * gx * -ny : 0
        const push = amp * (BULGE * g - SHRINK * (1 - g) + lift)
        pts.push([x + nx * push, y + ny * push])
      }
      path.setAttribute('d', smoothPath(pts))

      // Let the label squash along with the shape (read by `.blob-label`).
      const dx = w ? Math.max(-1, Math.min(1, (px - w / 2) / (w / 2))) : 0
      const dy = h ? Math.max(-1, Math.min(1, (py - h / 2) / (h / 2))) : 0
      const st = host.style
      st.setProperty('--blob-x', `${(amp * dx * 10).toFixed(2)}px`)
      st.setProperty('--blob-y', `${(amp * (dy * 3 - 5)).toFixed(2)}px`)
      st.setProperty('--blob-skew', `${(-amp * dx * 7).toFixed(2)}deg`)
      st.setProperty('--blob-sx', (1 - amp * 0.08).toFixed(3))
      st.setProperty('--blob-sy', (1 + amp * 0.16).toFixed(3))
    }

    const tick = () => {
      px += (tx - px) * 0.18
      py += (ty - py) * 0.18
      amp += (target - amp) * 0.12
      draw()
      const settled = target === 0 && amp < 0.002
      if (settled) {
        amp = 0
        draw()
        raf = 0
        return
      }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const measure = () => {
      w = host.offsetWidth
      h = host.offsetHeight
      svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`)
      draw()
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)

    const local = (e: PointerEvent) => {
      const b = host.getBoundingClientRect()
      tx = e.clientX - b.left
      ty = e.clientY - b.top
    }
    const onEnter = (e: PointerEvent) => {
      local(e)
      px = tx
      py = ty
      target = 1
      start()
    }
    const onMove = (e: PointerEvent) => {
      local(e)
      start()
    }
    const onLeave = () => {
      target = 0
      start()
    }

    if (interactive) {
      host.addEventListener('pointerenter', onEnter)
      host.addEventListener('pointermove', onMove)
      host.addEventListener('pointerleave', onLeave)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener('pointerenter', onEnter)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none absolute -z-10 overflow-visible"
      style={{ left: -PAD, top: -PAD, width: `calc(100% + ${2 * PAD}px)`, height: `calc(100% + ${2 * PAD}px)` }}
    >
      <path ref={pathRef} className={`transition-[fill,stroke] duration-200 ${className}`} />
    </svg>
  )
}
