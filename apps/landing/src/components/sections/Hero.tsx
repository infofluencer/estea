'use client'

import Image from 'next/image'
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { hero } from '@/data/content'
import { shopUrl } from '@/lib/site'
import Btn from '@/components/ui/Btn'

gsap.registerPlugin(ScrollTrigger)

/** Only seek when the target moved by ~2 frames at 30fps. */
const SEEK_EPSILON = 1 / 15

/** Hero copy and nav fade out over the first stretch of the scroll, then the video has the screen. */
function heroTextOpacity(progress: number) {
  if (progress < 0.06) return 1
  return Math.max(0, 1 - (progress - 0.06) / 0.08)
}

/** The still photo fades into the video over the first stretch of scroll. */
const POSTER_FADE_END = 0.05
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * Full-screen hero. On load it is a photograph (the video's first frame as a
 * separate image layer); scrolling fades that image out while the video under
 * it is scrubbed frame by frame, so the hand-off from photo to motion is invisible.
 */
export default function Hero() {
  const wrapperRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const posterRef = useRef<HTMLImageElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const targetTimeRef = useRef(0)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const wrapper = wrapperRef.current
    const pin = pinRef.current
    const video = videoRef.current
    const poster = posterRef.current
    if (!wrapper || !pin || !video) return

    let cancelled = false
    let isSeeking = false
    let trigger: ScrollTrigger | undefined
    const nav = document.getElementById('main-nav')

    const applySeek = () => {
      if (cancelled || isSeeking || video.readyState < 2) return
      const target = targetTimeRef.current
      if (Math.abs(target - video.currentTime) < SEEK_EPSILON) return
      isSeeking = true
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked)
        isSeeking = false
        if (cancelled) return
        // Catch up if scroll moved during the seek.
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

    const render = (progress: number) => {
      if (poster) poster.style.opacity = String(1 - clamp01(progress / POSTER_FADE_END))
      const op = heroTextOpacity(progress)
      if (textRef.current) {
        textRef.current.style.opacity = String(op)
        textRef.current.style.pointerEvents = op < 0.05 ? 'none' : ''
      }
      if (nav) {
        nav.style.opacity = String(op)
        nav.style.pointerEvents = op < 0.05 ? 'none' : ''
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
      // Pinned until the wrapper has scrolled fully past, so the section after
      // the hero slides up over the still-scrubbing video and covers it.
      trigger = ScrollTrigger.create({
        trigger: wrapper,
        start: 'top top',
        end: 'bottom top',
        pin,
        pinSpacing: false,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onRefresh: (self) => render(self.progress),
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
      // Decode the first frame so scrubbing starts from a warm decoder; the poster stays visible meanwhile.
      void video
        .play()
        .then(() => {
          video.pause()
          setupScrub()
        })
        .catch(setupScrub)
    }

    if (video.readyState >= 1) onReady()
    else video.addEventListener('loadedmetadata', onReady)

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', onReady)
      video.pause()
      trigger?.kill()
      if (poster) poster.style.opacity = ''
      if (nav) {
        nav.style.opacity = ''
        nav.style.pointerEvents = ''
      }
    }
  }, [reducedMotion])

  const copy = (
    <div className="pointer-events-auto mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-10">
      <div className="relative max-w-2xl">
        {/* A soft dark pool behind the copy only; the rest of the picture stays untouched. */}
        <div
          aria-hidden="true"
          className="absolute -inset-x-12 -inset-y-10 -z-10 rounded-[4rem] bg-ink/45 blur-3xl sm:-inset-x-20 sm:-inset-y-14"
        />
        <h1 className="headline text-cream text-[12vw] leading-[0.95] tracking-[-0.03em] sm:text-[clamp(3rem,5.8vw,5.75rem)]">
          <span className="text-gold">{hero.brand}</span> {hero.title}
        </h1>
        <p className="mt-6 max-w-[34ch] text-[1.05rem] leading-[1.45] font-medium text-cream/85 sm:mt-8 sm:text-[1.2rem]">
          {hero.lead}
        </p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:mt-10 sm:flex-row">
          <Btn href="#harmanlar" variant="brand">
            {hero.cta}
          </Btn>
          <Btn href={shopUrl} variant="outline-cream">
            Alışveriş
          </Btn>
        </div>
      </div>
    </div>
  )

  const media = (
    <>
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
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
      {/* The opening photograph sits over the video and is faded out by the scroll. */}
      <Image
        ref={posterRef}
        src="/hero_poster.png"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        // PNG olduğu gibi gitsin; Next'in optimizer'ı yeniden sıkıştırmasın.
        unoptimized
        className="object-cover will-change-[opacity]"
      />
    </>
  )

  if (reducedMotion) {
    return (
      <section id="hero" className="relative bg-ink">
        <div className="relative min-h-svh overflow-hidden">
          {media}
          <div className="relative z-10 flex min-h-svh items-center py-28">{copy}</div>
        </div>
      </section>
    )
  }

  // Scroll length sets the scrub speed: the 10 s video is spread over 2.4 screens.
  // The next section starts sliding over the video for the last screen of that.
  return (
    <section ref={wrapperRef} id="hero" className="relative h-[240vh] bg-ink">
      <div ref={pinRef} className="relative h-svh min-h-[640px] overflow-hidden">
        {media}
        <div ref={textRef} className="absolute inset-0 z-10 flex items-center pt-20 sm:pt-[5.5rem]">
          {copy}
        </div>
      </div>
    </section>
  )
}
