import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

gsap.registerPlugin(ScrollTrigger)

const manifesto =
  'Çayın lezzetine inandık, doğadan gelen en saf yaprakları özenle harmanlıyoruz. Her yudumda Karadeniz.'

const manifestoWords = manifesto.split(' ')

const products = [
  { name: 'Gold Karadeniz', image: '/estea-gold-cay-1000-gr.png', href: 'https://market.esteacay.com/u/estea-gold-cay-1000-gr/' },
  { name: 'İlk Hasat', image: '/estea-hasat-cay-1000-gr.png', href: 'https://market.esteacay.com/u/es-tea-ilk-hasat-cay-5000-gr/' },
  { name: 'Tiryaki', image: '/estea-tiryaki-1000-gr-cay.png', href: 'https://market.esteacay.com/u/es-tea-tiryaki-cayi-1000-gr/' },
  { name: 'Karadeniz', image: '/estea-karadeniz-cayi-1000-gr.png', href: 'https://market.esteacay.com/u/estea-karadeniz-cay-1000-gr/' },
  { name: 'Gold 5000g', image: '/estea-gold-cay-5000-gr.png', href: 'https://market.esteacay.com/u/estea-gold-cay-5000-gr/' },
]

export default function ProductShowcase() {
  const sectionRef = useRef<HTMLElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (reducedMotion) return
    const section = sectionRef.current
    if (!section) return

    const cards = section.querySelectorAll<HTMLElement>('.product-card')
    const words = section.querySelectorAll<HTMLElement>('.manifesto-word')
    if (!cards.length) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=140%',
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })

      cards.forEach((card, i) => {
        tl.fromTo(
          card,
          {
            x: -(window.innerWidth * 0.55) - i * 140,
            filter: 'blur(18px)',
            opacity: 0,
            scale: 0.88,
          },
          {
            x: 0,
            filter: 'blur(0px)',
            opacity: 1,
            scale: 1,
            ease: 'power2.out',
          },
          0,
        )
      })

      words.forEach((word, i) => {
        const fromLeft = i % 2 === 0
        tl.fromTo(
          word,
          {
            x: fromLeft ? -window.innerWidth * 0.45 : window.innerWidth * 0.45,
            opacity: 0,
          },
          {
            x: 0,
            opacity: 1,
            ease: 'power2.out',
          },
          0,
        )
      })
    }, section)

    return () => ctx.revert()
  }, [reducedMotion])

  return (
    <section
      ref={sectionRef}
      id="urunler"
      className="relative min-h-screen overflow-hidden bg-cover bg-center bg-no-repeat pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-24 lg:pt-36"
      style={{ backgroundImage: 'url(/showcase.jpg)' }}
    >
      <div className="absolute inset-0 bg-ink/25" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-6xl items-start justify-center gap-5 px-5 sm:gap-7 lg:gap-10">
        {products.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className="product-card group flex w-[18%] shrink-0 flex-col items-center sm:w-[16%]"
          >
            <div className="aspect-[3/4] w-full">
              <img
                src={p.image}
                alt={p.name}
                width={480}
                height={640}
                className="h-full w-full object-contain drop-shadow-lg transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            <h3 className="mt-1 text-center font-display text-[0.85rem] font-bold uppercase tracking-wider text-cream drop-shadow-sm sm:text-[1rem] lg:text-[1.15rem]">
              {p.name}
            </h3>
          </a>
        ))}
      </div>

      <p className="relative mx-auto mt-10 max-w-5xl px-5 text-center font-display text-[2.2rem] font-bold uppercase leading-snug tracking-wide text-cream drop-shadow-md sm:mt-12 sm:text-[3rem] md:text-[3.8rem] lg:text-[4.5rem]">
        {manifestoWords.map((word) => (
          <span key={word} className="manifesto-word inline-block whitespace-nowrap">
            {word}&nbsp;
          </span>
        ))}
      </p>
    </section>
  )
}
