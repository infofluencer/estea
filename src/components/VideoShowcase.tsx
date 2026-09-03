import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

function heroTextOpacity(progress: number) {
  if (progress < 0.08) return 1
  return Math.max(0, 1 - (progress - 0.08) / 0.12)
}

function titleOpacity(progress: number) {
  if (progress < 0.35) return 0
  if (progress < 0.5) return (progress - 0.35) / 0.15
  if (progress > 0.78) return Math.max(0, 1 - (progress - 0.78) / 0.22)
  return 1
}

export default function VideoShowcase() {
  const wrapperRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const heroTextRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const targetTimeRef = useRef(0)
  const rafRef = useRef(0)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return

    const wrapper = wrapperRef.current
    const pin = pinRef.current
    const video = videoRef.current
    if (!wrapper || !pin || !video) return

    let cancelled = false
    let isSeeking = false
    let onSeeked: (() => void) | undefined

    const tick = () => {
      const target = targetTimeRef.current
      if (video.readyState >= 2 && !isSeeking) {
        const diff = target - video.currentTime
        if (Math.abs(diff) > 0.033) {
          isSeeking = true
          onSeeked = () => {
            isSeeking = false
            if (onSeeked) video.removeEventListener('seeked', onSeeked)
            onSeeked = undefined
          }
          video.addEventListener('seeked', onSeeked)
          video.currentTime = target
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const setupScrub = () => {
      if (cancelled) return
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return

      targetTimeRef.current = 0
      video.currentTime = 0

      ScrollTrigger.create({
        trigger: wrapper,
        start: 'top top',
        end: 'bottom bottom',
        pin,
        pinSpacing: false,
        scrub: 1,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          targetTimeRef.current = self.progress * duration
          const heroOp = heroTextOpacity(self.progress)
          if (heroTextRef.current) {
            heroTextRef.current.style.opacity = String(heroOp)
          }
          const nav = document.getElementById('main-nav')
          if (nav) {
            nav.style.opacity = String(heroOp)
            nav.style.pointerEvents = heroOp < 0.05 ? 'none' : ''
          }
          if (titleRef.current) {
            titleRef.current.style.opacity = String(titleOpacity(self.progress))
          }
        },
      })

      ScrollTrigger.refresh()
      rafRef.current = requestAnimationFrame(tick)
    }

    const onReady = () => {
      const duration = video.duration
      if (!Number.isFinite(duration) || duration <= 0) return

      void video
        .play()
        .then(() => {
          video.pause()
          setupScrub()
        })
        .catch(() => {
          setupScrub()
        })
    }

    if (video.readyState >= 1) {
      onReady()
    } else {
      video.addEventListener('loadedmetadata', onReady)
    }

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      video.removeEventListener('loadedmetadata', onReady)
      if (onSeeked) video.removeEventListener('seeked', onSeeked)
      video.pause()
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
    }
  }, [reducedMotion])

  const heroContent = (
    <div className="pointer-events-auto px-5 sm:px-8 lg:px-12 xl:px-20">
      <div className="max-w-xl">
        <h1 className="font-display text-[3rem] font-black uppercase leading-[0.95] tracking-wide text-cream sm:text-[4rem] md:text-[5rem] lg:text-[5.5rem]">
          Çayın lezzeti doğadan
        </h1>
        <p className="mt-6 max-w-lg font-display text-[1.1rem] font-normal normal-case leading-relaxed text-cream/80 sm:mt-8 sm:text-[1.25rem]">
          Rize ve Artvin'in sisli yamaçlarından özenle toplanan yapraklar,
          katkısız harmanlanır. Her yudumda Karadeniz.
        </p>
        <div className="mt-8 flex flex-col items-start gap-3 sm:mt-10 sm:flex-row">
          <a
            href="#urunler"
            className="inline-flex min-h-12 items-center justify-center rounded-sm bg-[#6B8E23] px-8 text-[0.8rem] font-bold tracking-[0.16em] text-cream uppercase transition-colors hover:bg-[#5A7A1C] focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Ürünlerimiz
          </a>
          <a
            href="https://market.esteacay.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center rounded-sm border border-cream/50 bg-transparent px-8 text-[0.8rem] font-medium tracking-[0.16em] text-cream uppercase transition-colors hover:border-cream hover:bg-cream/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            Alışveriş
          </a>
        </div>
      </div>
    </div>
  )

  if (reducedMotion) {
    return (
      <section id="video" className="relative bg-ink">
        <div className="relative min-h-screen overflow-hidden">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
          >
            <source src="/hero_scrub.mp4" type="video/mp4" />
          </video>
          <div
            className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/30 to-transparent"
            aria-hidden="true"
          />
          <div className="relative z-10 flex min-h-screen items-center">
            {heroContent}
          </div>
        </div>
      </section>
    )
  }

  return (
    <section
      ref={wrapperRef}
      id="video"
      className="relative h-[300vh] bg-ink"
    >
      <div ref={pinRef} className="relative h-screen overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="auto"
          aria-hidden="true"
          tabIndex={-1}
        >
          <source src="/hero_scrub.mp4" type="video/mp4" />
        </video>

        <div
          className="absolute inset-0 bg-gradient-to-r from-ink/65 via-ink/25 to-transparent"
          aria-hidden="true"
        />

        <div
          ref={heroTextRef}
          className="absolute inset-0 z-10 flex items-center"
        >
          {heroContent}
        </div>

      </div>
    </section>
  )
}
