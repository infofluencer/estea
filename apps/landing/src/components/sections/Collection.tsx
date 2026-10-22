'use client'

import { useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import Image from 'next/image'
import { collection, products, type Tone } from '@/data/content'
import { Glass, Sprig, Teapot, type Doodle } from '@/components/ui/Doodles'
import BlobBg from '@/components/ui/BlobBg'

/* The whole section recolours after the active pack: headline, caption,
   arrows, doodles and the CTA all read from --accent. */
const tones: Record<Tone, { accent: string; btn: string; btnFg: string }> = {
  gold: { accent: '#3b2f14', btn: '#e9ba3c', btnFg: '#111111' },
  leaf: { accent: '#467910', btn: '#467910', btnFg: '#f8f8f8' },
  brand: { accent: '#b43317', btn: '#b43317', btnFg: '#f8f8f8' },
  sun: { accent: '#c4511a', btn: '#d05a20', btnFg: '#f8f8f8' },
}

/* Scale by distance from the active slot; |2| is parked out of view. */
const slot = [
  { scale: 1.15, opacity: 1 },
  { scale: 0.66, opacity: 1 },
  { scale: 0.4, opacity: 0 },
]

const SWIPE_PX = 40

const arrows = [
  { d: -1, label: 'Önceki harman', glyph: '←' },
  { d: 1, label: 'Sonraki harman', glyph: '→' },
]

/* Left/right doodle pair per pack, cycling through the set. */
const doodlePairs: [Doodle, Doodle][] = [
  [Sprig, Glass],
  [Glass, Teapot],
  [Teapot, Sprig],
]

export default function Collection() {
  const [active, setActive] = useState(0)
  const dragX = useRef<number | null>(null)
  const n = products.length

  const step = (d: number) => setActive((a) => (a + d + n) % n)
  const offsetOf = (i: number) => {
    const o = (i - active + n) % n
    return o > n / 2 ? o - n : o
  }

  const onPointerDown = (e: PointerEvent) => {
    dragX.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (dragX.current === null) return
    const dx = e.clientX - dragX.current
    dragX.current = null
    if (Math.abs(dx) > SWIPE_PX) step(dx < 0 ? 1 : -1)
  }

  const current = products[active]
  const tone = tones[current.tone]
  const [Left, Right] = doodlePairs[active % doodlePairs.length]
  const band = [...collection.taglines, ...collection.taglines]
  const bandIcons = [Glass, Sprig, Teapot]

  return (
    <section
      id="harmanlar"
      className="relative overflow-x-clip bg-linen text-ink"
      style={
        {
          '--accent': tone.accent,
          '--btn': tone.btn,
          '--btn-fg': tone.btnFg,
        } as CSSProperties
      }
    >
      <div className="relative z-20 -mt-7 overflow-hidden border-y border-brand/25 bg-gold py-3 text-brand">
        <ul className="marquee flex w-max motion-reduce:animate-none" aria-label="Esçay">
          {band.map((t, i) => {
            const Icon = bandIcons[i % bandIcons.length]
            return (
              <li
                key={i}
                aria-hidden={i >= collection.taglines.length}
                className="flex items-center gap-12 pr-12 text-[0.95rem] font-bold whitespace-nowrap"
              >
                {t}
                <Icon className="h-8 w-8 shrink-0" />
              </li>
            )
          })}
        </ul>
      </div>

      <div className="mx-auto w-full max-w-7xl px-5 pt-14 text-center sm:px-8 lg:pt-20">
        <div data-reveal>
          <h2
            key={current.slug}
            className="caption-in headline mx-auto flex min-h-[2em] max-w-3xl items-center justify-center text-[clamp(2rem,4.4vw,3.6rem)] [color:var(--accent)] transition-colors duration-500 motion-reduce:animate-none"
          >
            {current.headline}
          </h2>
        </div>

        <div
          className="relative mx-auto mt-2 h-[250px] max-w-5xl touch-pan-y select-none sm:h-[290px] lg:h-[340px]"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (dragX.current = null)}
          data-reveal
        >
          <div
            key={current.slug}
            className="caption-in [color:var(--accent)] transition-colors duration-500 motion-reduce:animate-none"
            aria-hidden="true"
          >
            <Left className="pointer-events-none absolute top-[30%] left-[calc(50%-260px)] hidden h-24 w-24 -rotate-12 md:block" />
            <Right className="pointer-events-none absolute top-[42%] left-[calc(50%+165px)] hidden h-24 w-24 rotate-12 md:block" />
          </div>

          {products.map((p, i) => {
            const off = offsetOf(i)
            const s = slot[Math.min(Math.abs(off), 2)]
            const isActive = off === 0
            const onClick = (e: MouseEvent) => {
              if (isActive) return
              e.preventDefault()
              setActive(i)
            }
            return (
              <a
                key={p.slug}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClick}
                tabIndex={isActive ? 0 : -1}
                aria-hidden={!isActive}
                aria-label={isActive ? `${p.name} ${p.weight}, ürüne git` : undefined}
                style={
                  {
                    '--off': off,
                    transform: `translate(calc(-50% + var(--off) * var(--gap)), -50%) scale(${s.scale})`,
                    opacity: s.opacity,
                    zIndex: 10 - Math.abs(off),
                  } as CSSProperties
                }
                className={`absolute top-1/2 left-1/2 aspect-square h-full [--gap:150px] transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none sm:[--gap:min(30vw,300px)] lg:[--gap:min(28vw,400px)] ${isActive ? 'cursor-pointer' : 'cursor-w-resize'} ${s.opacity === 0 ? 'pointer-events-none' : ''}`}
              >
                <Image
                  src={p.image}
                  alt={isActive ? '' : `${p.name} seç`}
                  fill
                  sizes="(min-width: 1024px) 420px, 70vw"
                  priority={i === 0}
                  draggable={false}
                  className="object-contain"
                />
              </a>
            )
          })}

          {/* On phones the arrows sit in the stage's lower corners, under the side packs; swiping works too. */}
          <div className="pointer-events-none absolute inset-x-1 bottom-0 z-20 flex justify-between md:hidden">
            {arrows.map((b) => (
              <button
                key={b.d}
                type="button"
                onClick={() => step(b.d)}
                aria-label={b.label}
                className="pointer-events-auto inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg shadow-[0_6px_14px_rgba(0,0,0,0.18)] [background:var(--btn)] [color:var(--btn-fg)] transition-colors duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-linen"
              >
                {b.glyph}
              </button>
            ))}
          </div>
        </div>

        <div className="relative mx-auto mt-3 max-w-md">
          <div key={current.slug} className="caption-in [color:var(--accent)] transition-colors duration-500 motion-reduce:animate-none">
            <h3 className="headline text-[1.5rem] sm:text-[1.7rem]">
              {current.name}, {current.weight}
            </h3>
            <p className="mx-auto mt-2 min-h-[3.25em] max-w-sm text-[0.98rem] leading-relaxed text-ink/70">{current.note}</p>
            <a
              href={current.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative isolate mt-5 inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[0.8rem] font-bold tracking-[0.14em] uppercase [color:var(--btn-fg)] transition-colors duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-linen"
            >
              <BlobBg className="[fill:var(--btn)] [transition-duration:500ms]" />
              <span className="blob-label">{collection.cta}</span>
            </a>
          </div>

          <div className="pointer-events-none absolute inset-x-[-4.5rem] top-[58%] hidden -translate-y-1/2 items-center justify-between md:flex">
            {arrows.map((b) => (
              <button
                key={b.d}
                type="button"
                onClick={() => step(b.d)}
                aria-label={b.label}
                className="pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full text-lg [background:var(--btn)] [color:var(--btn-fg)] transition-[background-color,color,transform] duration-500 hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-linen"
              >
                {b.glyph}
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox="0 0 1440 90"
        preserveAspectRatio="none"
        className="mt-8 block h-[44px] w-full text-moss sm:h-[64px] lg:mt-10"
        aria-hidden="true"
      >
        <path fill="currentColor" d="M0 58C320 8 760 98 1440 30V90H0Z" />
      </svg>
    </section>
  )
}
