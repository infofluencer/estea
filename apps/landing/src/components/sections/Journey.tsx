import type { CSSProperties } from 'react'
import { journey } from '@/data/content'
import { doodles } from '@/components/ui/Doodles'

/* Stop positions on the desktop stage, in % of its width and height:
   a zigzag from the garden on the left to the glass on the right. */
const points = journey.stops.map((_, i, all) => ({
  x: 8 + (i * 84) / (all.length - 1),
  y: i % 2 === 0 ? 36 : 66,
}))

/** Smooth path through the stops (Catmull-Rom as cubic Béziers) in a 1000×600 box. */
function trail(pts: { x: number; y: number }[]) {
  const p = [{ x: 0, y: 40 }, ...pts, { x: 100, y: 46 }].map((q) => [q.x * 10, q.y * 6] as const)
  let d = `M${p[0][0]},${p[0][1]}`
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i]
    const p1 = p[i]
    const p2 = p[i + 1]
    const p3 = p[i + 2] ?? p2
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`
  }
  return d
}

const desktopTrail = trail(points)
/* Phone: a gentle wave running down beside the discs. */
const phoneTrail = 'M10,0 C18,10 2,20 10,30 S18,50 10,60 S2,80 10,90 S14,98 10,100'

/* Always fully drawn: the section shows complete on arrival, nothing waits for the scroll. */
const trailProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  vectorEffect: 'non-scaling-stroke',
} as const

export default function Journey() {
  return (
    <section
      id="yolculuk"
      aria-labelledby="yolculuk-baslik"
      className="relative z-10 bg-moss pt-20 pb-24 text-cream sm:pt-24 lg:pb-28"
    >
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end">
          <h2
            id="yolculuk-baslik"
            className="headline text-gold text-[clamp(3rem,7.4vw,7rem)] leading-[0.9] tracking-[-0.03em] lg:col-span-7"
          >
            {journey.title}
          </h2>
          <p className="max-w-[36ch] text-[1.1rem] leading-[1.45] font-medium sm:text-[1.25rem] lg:col-span-5 lg:justify-self-end">
            {journey.lead}
          </p>
        </div>

        <div data-stage className="relative mt-14 lg:mt-16 lg:h-[540px]">
          {/* The trail: one hand-drawn line, cream like the doodles. */}
          <svg
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 hidden h-full w-full text-cream/70 lg:block"
            aria-hidden="true"
          >
            <path d={desktopTrail} {...trailProps} />
          </svg>
          <svg
            viewBox="0 0 20 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute top-2 bottom-10 left-[34px] w-5 text-cream/70 lg:hidden"
            aria-hidden="true"
          >
            <path d={phoneTrail} {...trailProps} />
          </svg>

          <ol className="relative flex flex-col gap-10 lg:absolute lg:inset-0 lg:block">
            {journey.stops.map((stop, i) => {
              const Icon = doodles[stop.icon]
              const pt = points[i]
              const high = i % 2 === 0
              return (
                // On wide screens the li is a zero-size anchor at its point on the trail;
                // the disc centres on it and the words sit above (high stops) or below (low stops), clear of the line.
                <li
                  key={stop.verb}
                  style={{ '--x': `${pt.x}%`, '--y': `${pt.y}%` } as CSSProperties}
                  className="grid grid-cols-[88px_1fr] items-center gap-5 lg:absolute lg:top-[var(--y)] lg:left-[var(--x)] lg:block lg:h-0 lg:w-0"
                >
                  <span
                    className="flex h-[88px] w-[88px] items-center justify-center rounded-full transition-transform duration-300 hover:-rotate-6 lg:absolute lg:top-0 lg:left-0 lg:-mt-[44px] lg:-ml-[44px]"
                    style={{ background: stop.disc, color: stop.ink }}
                  >
                    <Icon className="h-14 w-14" />
                  </span>
                  <div className={`lg:absolute lg:left-0 lg:w-52 lg:-translate-x-1/2 lg:text-center ${high ? 'lg:bottom-[60px]' : 'lg:top-[60px]'}`}>
                    <h3 className="headline text-[1.9rem] text-cream">{stop.verb}</h3>
                    <p className="mt-1.5 text-[1rem] leading-[1.45] text-cream">{stop.body}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </section>
  )
}
