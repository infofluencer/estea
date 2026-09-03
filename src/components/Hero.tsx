import { useEffect, useRef } from 'react'

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const freeze = () => {
      video.pause()
      video.currentTime = 0
    }

    if (video.readyState >= 1) {
      freeze()
    } else {
      video.addEventListener('loadedmetadata', freeze, { once: true })
      return () => video.removeEventListener('loadedmetadata', freeze)
    }
  }, [])

  return (
    <section className="relative min-h-screen overflow-hidden bg-cream">
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
        className="absolute inset-0 bg-gradient-to-r from-cream/80 via-cream/35 to-transparent lg:from-cream/60 lg:via-cream/15"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-5 pb-24 pt-24 sm:px-8 lg:pb-16 lg:pt-20">
        <div className="max-w-xl text-center lg:-ml-8 lg:text-left xl:-ml-14">
          <p className="font-serif text-[0.95rem] italic text-garden sm:text-base">
            Karadeniz'in yüksek bahçelerinden
          </p>
          <h1 className="mt-4 font-sans text-[2.35rem] font-black leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-[3.5rem] lg:text-[3.85rem]">
            Yapraktan bardağa, gerçek çay
          </h1>
          <p className="mx-auto mt-5 max-w-md text-[0.95rem] font-normal leading-relaxed text-ink/75 sm:mt-6 sm:text-base lg:mx-0">
            Sisli yamaçlarda toplanan yapraklar, katkısız harmanlanır. Demi koyu,
            kokusu tanıdık — yalnızca bahçenin verdiği.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:mt-10 sm:flex-row lg:items-stretch">
            <a
              href="#urunler"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-sm bg-brand px-7 text-[0.8rem] font-bold tracking-[0.16em] text-cream uppercase transition-colors hover:bg-[#b00e29] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-cream sm:w-auto"
            >
              Ürünleri Keşfet
            </a>
            <a
              href="#hikaye"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-sm border border-ink/25 bg-transparent px-7 text-[0.8rem] font-medium tracking-[0.16em] text-ink uppercase transition-colors hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-cream sm:w-auto"
            >
              Hikayemiz
            </a>
          </div>
        </div>
      </div>

      <a
        href="#video"
        className="absolute bottom-7 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 rounded-sm text-ink/45 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-cream lg:left-auto lg:right-10 lg:translate-x-0"
        aria-label="Videoya kaydır"
      >
        <span className="text-[0.65rem] font-medium tracking-[0.28em] uppercase">
          Aşağı kaydır
        </span>
        <span className="block h-9 w-px bg-ink/30" aria-hidden="true" />
      </a>
    </section>
  )
}
