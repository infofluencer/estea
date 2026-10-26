'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import Image from 'next/image'

const SWIPE_PX = 40

/**
 * The photographs of one Journey step, all on the page at once: the first
 * runs the full width of the column, the rest share one row beneath it.
 * Any photo opens the set in a gallery view over the page, arrows in the
 * step's colour, where the rest can be paged through. A single photo keeps
 * the plain 4:3 frame and still opens large.
 */
export default function PhotoSet({
  images,
  color,
  label,
  sizes,
  className = '',
}: {
  images: readonly string[]
  /** Step colour for the gallery controls. */
  color: string
  /** Step name for the control labels, e.g. "Paketle". */
  label: string
  sizes: string
  className?: string
}) {
  const [lead, ...rest] = images
  /* The small row always has room for three, so a set of two still reads as one big and one small. */
  const cols = Math.max(rest.length, 3)
  const n = images.length

  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState<number | null>(null)
  const dragX = useRef<number | null>(null)

  const show = (i: number) => {
    setOpen(i)
    dialogRef.current?.showModal()
  }
  const close = useCallback(() => {
    dialogRef.current?.close()
    setOpen(null)
  }, [])
  const step = useCallback((d: number) => setOpen((a) => (a === null ? a : (a + d + n) % n)), [n])

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  const onPointerDown = (e: PointerEvent) => {
    dragX.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (dragX.current === null) return
    const dx = e.clientX - dragX.current
    dragX.current = null
    if (Math.abs(dx) > SWIPE_PX) step(dx < 0 ? 1 : -1)
  }

  const tile = 'group/tile relative block w-full overflow-hidden rounded-2xl bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-linen'
  const pic = 'object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/tile:scale-[1.03] motion-reduce:transition-none'

  return (
    <div className={`grid gap-3 sm:gap-4 ${className}`} style={{ '--step': color } as CSSProperties}>
      <button type="button" onClick={() => show(0)} aria-label={`${label} fotoğrafını büyüt`} className={`${tile} ${rest.length ? 'aspect-[16/10]' : 'aspect-[4/3]'} cursor-zoom-in`}>
        <Image src={lead} alt="" fill sizes={sizes} className={pic} />
      </button>

      {rest.length > 0 && (
        <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {rest.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => show(i + 1)}
              aria-label={`${label} fotoğrafı ${i + 2}, büyüt`}
              className={`${tile} aspect-[4/5] cursor-zoom-in`}
            >
              <Image src={src} alt="" fill sizes={`calc(${sizes} / ${cols})`} className={pic} />
            </button>
          ))}
        </div>
      )}

      {/* Gallery view: the set large over the page. Native dialog handles Esc, focus and the backdrop. */}
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
        aria-label={`${label} fotoğrafları`}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-cream backdrop:bg-ink/92 open:flex open:items-center open:justify-center"
      >
        {open !== null && (
          <div
            className="relative flex h-full w-full touch-pan-y flex-col items-center justify-center gap-5 px-4 py-16 select-none sm:px-20"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => (dragX.current = null)}
            onClick={(e) => {
              if (e.target === e.currentTarget) close()
            }}
          >
            <div key={images[open]} className="caption-in relative h-full w-full max-w-6xl overflow-hidden rounded-2xl motion-reduce:animate-none">
              <Image src={images[open]} alt="" fill sizes="100vw" priority draggable={false} className="object-contain" />
            </div>

            <div className="flex items-center gap-3">
              {n > 1 && (
                <button type="button" onClick={() => step(-1)} aria-label="Önceki fotoğraf" className="gallery-btn">
                  ←
                </button>
              )}
              <span className="headline inline-flex h-11 items-center rounded-full bg-linen px-4 text-[1rem] leading-none text-ink tabular-nums" aria-live="polite">
                {open + 1}
                <span className="mx-1 text-ink/40">/</span>
                {n}
              </span>
              {n > 1 && (
                <button type="button" onClick={() => step(1)} aria-label="Sonraki fotoğraf" className="gallery-btn">
                  →
                </button>
              )}
            </div>

            <button type="button" onClick={close} aria-label="Galeriyi kapat" className="gallery-btn absolute top-5 right-5 sm:top-6 sm:right-8">
              ×
            </button>
          </div>
        )}
      </dialog>
    </div>
  )
}
