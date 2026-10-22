'use client'

import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { hero } from '@/data/content'
import Btn from '@/components/ui/Btn'

gsap.registerPlugin(ScrollTrigger)

/** Only seek when the target moved by ~2 frames at 30fps. */
const SEEK_EPSILON = 1 / 15

/* İnce belli çay bardağı, drawn in a 100×160 box: wide rim, narrow waist, flared foot.
   The same outline clips the video (normalised to 0–1) and is drawn over it as a doodle. */
const GLASS_D =
  'M12,2 L88,2 C87,42 70,66 70,94 C70,118 82,130 82,150 Q82,158 74,158 L26,158 Q18,158 18,150 C18,130 30,118 30,94 C30,66 13,42 12,2 Z'
const GLASS_CLIP = GLASS_D.replace(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g, (pair) => {
  const [x, y] = pair.split(',').map(Number)
  return `${(x / 100).toFixed(4)},${(y / 160).toFixed(4)}`
})
/** The waist is the narrowest part: 40% of the glass width. */
const WAIST = 0.4

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const grow = gsap.parseEase('power2.inOut')

export default function Hero() {
  const wrapperRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const outlineRef = useRef<SVGSVGElement>(null)
  const teaRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const targetTimeRef = useRef(0)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const wrapper = wrapperRef.current
    const pin = pinRef.current
    const glass = glassRef.current
    const video = videoRef.current
    if (!wrapper || !pin || !glass || !video) return

    let cancelled = false
    let isSeeking = false
    let trigger: ScrollTrigger | undefined
    let maxScale = 1

    // Scale at which the glass, opened from its waist, covers the whole screen.
    const measure = () => {
      const w = glass.offsetWidth
      const h = glass.offsetHeight
      if (!w || !h) return
      maxScale = 1.15 * Math.max(window.innerWidth / (w * WAIST), window.innerHeight / (h * 0.8))
    }

    const render = (progress: number) => {
      const open = grow(clamp01((progress - 0.04) / 0.38))
      const s = 1 + (maxScale - 1) * open
      gsap.set(glass, { scale: s })
      gsap.set(video, { scale: 1 / s })
      if (outlineRef.current) outlineRef.current.style.opacity = String(1 - clamp01((progress - 0.02) / 0.1))
      // The tea drains away as the glass opens, and the video underneath takes over.
      if (teaRef.current) teaRef.current.style.opacity = String(1 - clamp01((progress - 0.03) / 0.14))
      if (textRef.current) {
        const op = 1 - clamp01(progress / 0.1)
        textRef.current.style.opacity = String(op)
        textRef.current.style.pointerEvents = op < 0.05 ? 'none' : ''
      }
    }

    const applySeek = () => {
      if (cancelled || isSeeking || video.readyState < 2) return
      const target = targetTimeRef.current
      if (Math.abs(target - video.currentTime) < SEEK_EPSILON) return
      isSeeking = true
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        isSeeking = false
        if (cancelled) return
        if (Math.abs(targetTimeRef.current - video.currentTime) >= SEEK_EPSILON) applySeek()
      }
      video.addEventListener('seeked', onSeeked)
      try {
        video.currentTime = target
      } catch {
        isSeeking = false
        video.removeEventListener('seeked', onSeeked)
      }
    }

    const setupScrub = () => {
      if (cancelled) return
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return
      targetTimeRef.current = 0
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
      trigger = ScrollTrigger.create({
        trigger: wrapper,
        start: 'top top',
        end: 'bottom bottom',
        pin,
        pinSpacing: false,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          measure()
          render(self.progress)
        },
        onUpdate: (self) => {
          targetTimeRef.current = self.progress * duration
          applySeek()
          render(self.progress)
        },
      })
      ScrollTrigger.refresh()
    }

    const onReady = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return
      void video
        .play()
        .then(() => {
          video.pause()
          setupScrub()
        })
        .catch(setupScrub)
    }

    measure()
    if (video.readyState >= 1) onReady()
    else video.addEventListener('loadedmetadata', onReady)

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onReady)
      video.pause()
      trigger?.kill()
      gsap.set([glass, video], { clearProps: 'transform' })
    }
  }, [reducedMotion])

  return (
    <section ref={wrapperRef} id="hero" className={`relative bg-linen ${reducedMotion ? '' : 'h-[240vh]'}`}>
      <div
        ref={pinRef}
        className="relative h-svh min-h-[640px] overflow-hidden bg-linen [--gh:40svh] lg:[--gh:60svh]"
      >
        <svg width="0" height="0" className="absolute" aria-hidden="true">
          <defs>
            <clipPath id="hero-glass" clipPathUnits="objectBoundingBox">
              <path d={GLASS_CLIP} />
            </clipPath>
          </defs>
        </svg>

        {/* The glass: a window the video plays through, centred on the screen. It opens to full screen on scroll. */}
        <div
          ref={glassRef}
          className="absolute top-1/2 left-1/2 h-[var(--gh)] w-[calc(var(--gh)*0.625)] will-change-transform"
          style={{ marginTop: 'calc(var(--gh) / -2)', marginLeft: 'calc(var(--gh) * -0.3125)' }}
        >
          <div className="absolute inset-0 overflow-hidden [clip-path:url(#hero-glass)]">
            <video
              ref={videoRef}
              className="absolute top-1/2 left-1/2 h-svh w-screen max-w-none object-cover will-change-transform"
              style={{ marginTop: '-50svh', marginLeft: '-50vw' }}
              poster="/hero_poster.jpg"
              muted
              playsInline
              preload={reducedMotion ? 'metadata' : 'auto'}
              disablePictureInPicture
              aria-hidden="true"
              tabIndex={-1}
            >
              <source src="/hero_scrub.mp4" type="video/mp4" />
            </video>

            {/* A full glass of tavşan kanı tea over the video: empty glass at the rim, the surface line,
                a reflection down the body and the thick foot. Flat brand colours, drawn like the doodles. */}
            <div ref={teaRef} className="absolute inset-0" aria-hidden="true">
              <div className="absolute inset-x-0 top-0 h-[15%] bg-leaf-soft" />
              <div className="absolute inset-x-0 top-[15%] bottom-[5%] bg-brand" />
              <div className="absolute inset-x-0 top-[15%] h-[2.5%] bg-amber" />
              <div className="absolute inset-x-0 bottom-0 h-[5%] bg-olive" />
              <div className="absolute top-[22%] bottom-[14%] left-[24%] w-[5%] rounded-full bg-cream/25" />
              <div className="absolute top-[24%] left-[33%] h-[6%] w-[2.5%] rounded-full bg-cream/20" />
            </div>
          </div>
          <svg
            ref={outlineRef}
            viewBox="0 0 100 160"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-olive"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={GLASS_D} vectorEffect="non-scaling-stroke" />
            <path d="M-4,160 C14,172 86,172 104,160" vectorEffect="non-scaling-stroke" />
            <path className="hidden lg:block" d="M38,-6 c-4,-6 4,-10 0,-16 M50,-6 c-4,-6 4,-10 0,-16 M62,-6 c-4,-6 4,-10 0,-16" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        {/* The title splits around the glass: "Çayın lezzeti" on the left, "doğadan" on the right. */}
        <div
          ref={textRef}
          className="absolute inset-0 z-10 flex flex-col px-5 pt-28 pb-10 sm:px-8 lg:justify-center lg:pt-16 lg:pb-0"
        >
          <div className="mx-auto w-full max-w-7xl">
            <h1 className="headline text-olive text-[12vw] leading-[0.9] tracking-[-0.03em] lg:grid lg:grid-cols-[1fr_calc(var(--gh)*0.625)_1fr] lg:items-end lg:gap-x-12 lg:text-[clamp(3.5rem,7vw,8rem)]">
              <span className="block lg:text-right">
                Çayın <br className="hidden lg:block" />
                lezzeti
              </span>
              <span className="hidden lg:block" aria-hidden="true" />
              <span className="block">doğadan</span>
            </h1>
          </div>

          <div className="mx-auto mt-auto w-full max-w-7xl lg:mt-10 lg:grid lg:grid-cols-[1fr_calc(var(--gh)*0.625)_1fr] lg:gap-x-12">
            <div className="lg:col-start-3">
              <p className="max-w-[30ch] text-[1.05rem] leading-[1.45] font-medium text-ink sm:text-[1.2rem]">{hero.lead}</p>
              <div className="mt-6">
                <Btn href="#harmanlar" variant="gold">
                  {hero.cta}
                </Btn>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
