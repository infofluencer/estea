'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { about } from '@/data/content'
import { corporateLinks } from '@/lib/site'
import { Glass, Sprig, Teapot } from '@/components/ui/Doodles'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import BlobBg from '@/components/ui/BlobBg'

gsap.registerPlugin(ScrollTrigger)

const words = about.lead.split(' ')

/* Torn edges for the photo (objectBoundingBox): down the left side on desktop,
   across the bottom on mobile where the photo sits above the copy. */
const TEAR_FRONT = 'M0.042,0.000 L0.041,0.010 L0.046,0.020 L0.054,0.030 L0.050,0.040 L0.055,0.050 L0.055,0.060 L0.057,0.070 L0.060,0.080 L0.060,0.090 L0.067,0.100 L0.064,0.110 L0.067,0.120 L0.067,0.130 L0.070,0.140 L0.071,0.150 L0.074,0.160 L0.070,0.170 L0.067,0.180 L0.068,0.190 L0.074,0.200 L0.068,0.210 L0.074,0.220 L0.074,0.230 L0.077,0.240 L0.076,0.250 L0.080,0.260 L0.079,0.270 L0.081,0.280 L0.084,0.290 L0.083,0.300 L0.081,0.310 L0.083,0.320 L0.093,0.330 L0.093,0.340 L0.094,0.350 L0.102,0.360 L0.103,0.370 L0.106,0.380 L0.109,0.390 L0.106,0.400 L0.107,0.410 L0.112,0.420 L0.109,0.430 L0.115,0.440 L0.113,0.450 L0.119,0.460 L0.122,0.470 L0.125,0.480 L0.126,0.490 L0.124,0.500 L0.123,0.510 L0.123,0.520 L0.126,0.530 L0.127,0.540 L0.125,0.550 L0.133,0.560 L0.133,0.570 L0.138,0.580 L0.137,0.590 L0.141,0.600 L0.142,0.610 L0.147,0.620 L0.149,0.630 L0.153,0.640 L0.156,0.650 L0.162,0.660 L0.166,0.670 L0.165,0.680 L0.171,0.690 L0.174,0.700 L0.183,0.710 L0.189,0.720 L0.187,0.730 L0.193,0.740 L0.192,0.750 L0.192,0.760 L0.199,0.770 L0.198,0.780 L0.199,0.790 L0.203,0.800 L0.204,0.810 L0.208,0.820 L0.211,0.830 L0.212,0.840 L0.215,0.850 L0.214,0.860 L0.213,0.870 L0.214,0.880 L0.214,0.890 L0.219,0.900 L0.219,0.910 L0.225,0.920 L0.226,0.930 L0.230,0.940 L0.235,0.950 L0.232,0.960 L0.234,0.970 L0.237,0.980 L0.240,0.990 L1.000,1.000 L1.000,0.000 Z'
const TEAR_BOTTOM = 'M0,0 L1,0 L1.000,0.886 L0.990,0.884 L0.980,0.889 L0.970,0.890 L0.960,0.889 L0.950,0.891 L0.940,0.891 L0.930,0.891 L0.920,0.897 L0.910,0.900 L0.900,0.898 L0.890,0.904 L0.880,0.900 L0.870,0.900 L0.860,0.898 L0.850,0.905 L0.840,0.903 L0.830,0.904 L0.820,0.903 L0.810,0.899 L0.800,0.901 L0.790,0.902 L0.780,0.898 L0.770,0.903 L0.760,0.897 L0.750,0.893 L0.740,0.896 L0.730,0.889 L0.720,0.895 L0.710,0.891 L0.700,0.892 L0.690,0.891 L0.680,0.893 L0.670,0.891 L0.660,0.891 L0.650,0.897 L0.640,0.892 L0.630,0.897 L0.620,0.892 L0.610,0.899 L0.600,0.900 L0.590,0.901 L0.580,0.903 L0.570,0.904 L0.560,0.907 L0.550,0.904 L0.540,0.908 L0.530,0.911 L0.520,0.906 L0.510,0.912 L0.500,0.911 L0.490,0.907 L0.480,0.908 L0.470,0.909 L0.460,0.910 L0.450,0.916 L0.440,0.912 L0.430,0.909 L0.420,0.910 L0.410,0.914 L0.400,0.916 L0.390,0.912 L0.380,0.912 L0.370,0.913 L0.360,0.916 L0.350,0.913 L0.340,0.919 L0.330,0.921 L0.320,0.924 L0.310,0.923 L0.300,0.925 L0.290,0.928 L0.280,0.934 L0.270,0.931 L0.260,0.935 L0.250,0.935 L0.240,0.936 L0.230,0.938 L0.220,0.947 L0.210,0.950 L0.200,0.949 L0.190,0.953 L0.180,0.954 L0.170,0.956 L0.160,0.956 L0.150,0.951 L0.140,0.956 L0.130,0.956 L0.120,0.953 L0.110,0.956 L0.100,0.954 L0.090,0.953 L0.080,0.953 L0.070,0.958 L0.060,0.951 L0.050,0.950 L0.040,0.955 L0.030,0.954 L0.020,0.951 L0.010,0.955 L-0.000,0.949 Z'

/* Each fact gets its own brand colour so the row reads as the palette. */
const pointStyle = {
  sprig: { Icon: Sprig, circle: 'bg-leaf text-ink' },
  teapot: { Icon: Teapot, circle: 'bg-gold text-ink' },
  glass: { Icon: Glass, circle: 'bg-brand text-cream' },
}

export default function Manifesto() {
  const ref = useRef<HTMLElement>(null)
  const reduced = usePrefersReducedMotion()

  useEffect(() => {
    if (reduced) return
    const section = ref.current
    if (!section) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        section.querySelectorAll('.w'),
        { opacity: 0.18 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: 'none',
          scrollTrigger: {
            trigger: section.querySelector('.about-lead'),
            start: 'top 80%',
            end: 'bottom 50%',
            scrub: true,
          },
        },
      )
    }, section)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={ref} id="hakkimizda" aria-labelledby="hakkimizda-baslik" className="relative z-10 overflow-hidden bg-garden-dark text-cream">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <clipPath id="tear-front" clipPathUnits="objectBoundingBox">
            <path d={TEAR_FRONT} />
          </clipPath>
          <clipPath id="tear-bottom" clipPathUnits="objectBoundingBox">
            <path d={TEAR_BOTTOM} />
          </clipPath>
        </defs>
      </svg>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 pb-20 sm:px-8 lg:min-h-[700px] lg:grid-cols-12 lg:items-center lg:gap-8 lg:py-28 lg:pb-28">
        <div className="order-2 lg:order-none lg:col-span-5">
          <h2
            id="hakkimizda-baslik"
            className="text-[clamp(2.6rem,4.6vw,4.2rem)] leading-[1] font-bold tracking-[-0.03em] text-gold"
          >
            {about.title}
          </h2>
          <p className="about-lead mt-7 max-w-[30ch] text-[clamp(1.2rem,1.6vw,1.45rem)] leading-[1.45] font-medium text-cream">
            {words.map((w, i) => (
              <span key={`${w}-${i}`} className="w inline-block">
                {w}&nbsp;
              </span>
            ))}
          </p>
          <p className="mt-5 max-w-[42ch] text-[1rem] leading-relaxed text-cream/75">{about.body}</p>

          <ul className="mt-10 grid max-w-md grid-cols-3 gap-4">
            {about.points.map((pt) => {
              const { Icon, circle } = pointStyle[pt.icon]
              return (
                <li key={pt.label} className="flex flex-col items-start gap-3">
                  <span className={`flex h-16 w-16 items-center justify-center rounded-full ${circle}`}>
                    <Icon className="h-10 w-10" />
                  </span>
                  <span className="text-[0.92rem] leading-snug font-semibold">{pt.label}</span>
                </li>
              )
            })}
          </ul>

          <a
            href={corporateLinks[0].href}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative isolate mt-10 inline-flex min-h-12 items-center rounded-full px-8 text-[0.8rem] font-bold tracking-[0.14em] text-brand-dark uppercase transition-colors duration-200 hover:text-cream focus-visible:text-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-garden-dark"
          >
            <BlobBg className="fill-gold group-hover:fill-brand" />
            <span className="blob-label">{about.link}</span>
          </a>
        </div>

        <div className="relative order-1 -mx-5 h-[400px] sm:-mx-8 sm:h-[520px] lg:order-none lg:col-span-7 lg:mx-0 lg:h-auto lg:self-stretch" data-reveal>
          <div className="absolute inset-0 lg:-inset-y-28 lg:right-[min(-2rem,calc((80rem-100vw)/2-2rem))]">
            <div className="absolute inset-0 [clip-path:url(#tear-bottom)] lg:[clip-path:url(#tear-front)]">
              <Image
                src="/showcase.jpg"
                alt="Karadeniz çay bahçeleri, sisli yamaçlar"
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover object-[55%_50%]"
              />
              <div
                className="absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.35),transparent_35%)]"
                aria-hidden="true"
              />
              <p className="absolute bottom-[17%] left-5 text-[0.85rem] text-cream/90 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] sm:left-8 lg:right-8 lg:bottom-14 lg:left-auto">
                {about.photoCaption}
              </p>
            </div>

            {/* Logo set on the tear like a seal pressed onto the page. */}
            <Image
              src="/logo.png"
              alt=""
              width={341}
              height={182}
              className="absolute right-6 -bottom-6 w-40 -rotate-[8deg] drop-shadow-[0_14px_18px_rgba(0,0,0,0.35)] sm:w-48 lg:top-[16%] lg:right-auto lg:bottom-auto lg:left-0 lg:w-56"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
