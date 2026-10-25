/* Line doodles in the brand's hand-drawn style; stroke follows currentColor. */

export type Doodle = (props: { className?: string }) => React.JSX.Element

const svgProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 3,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/* İnce belli bardak on its saucer, steaming. */
export const Glass: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M30 24h40M30 24c0 18 8 24 8 34 0 12-6 20-6 26M70 24c0 18-8 24-8 34 0 12 6 20 6 26M32 84h36" />
    <path d="M35 40h30" strokeWidth="2" />
    <path d="M18 90h64M24 90c6 6 46 6 52 0" />
    <path d="M42 14c-2-4 2-7 0-11M50 14c-2-4 2-7 0-11M58 14c-2-4 2-7 0-11" strokeWidth="2.5" />
  </svg>
)

/* Two leaves and a bud: the pluck every harvest starts with. */
export const Sprig: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M50 92V30" />
    <path d="M50 64C36 62 26 50 26 36c14 2 24 12 24 28ZM50 48c14-2 24-14 24-28-14 2-24 12-24 28Z" />
    <path d="M50 30c-4-6-2-14 0-20 2 6 4 14 0 20Z" />
    <path d="M50 64 30 42M50 48l20-22" strokeWidth="2" />
  </svg>
)

/* Çaydanlık, lid on, steam rising. */
export const Teapot: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M28 50h44c0 0-2 32-8 32H36c-6 0-8-32-8-32Z" />
    <path d="M32 50c0-8 36-8 36 0M50 42v-6" />
    <path d="M72 58 90 40M72 68l16-16" />
    <path d="M28 56c-14 2-14 16 0 18" />
    <path d="M44 30c-2-4 2-8 0-12M56 30c-2-4 2-8 0-12" strokeWidth="2.5" />
  </svg>
)

/* Çay bahçesi: iki yamaç, sıra sıra çay, tepede güneş. */
export const Hills: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M6 82c16-28 32-42 50-42s30 14 40 42" />
    <path d="M6 82c10-14 20-22 34-22 12 0 22 8 30 22" />
    <path d="M24 72c6-4 14-4 20 0M30 62c6-3 12-3 18 0" strokeWidth="2" />
    <circle cx="78" cy="24" r="8" />
    <path d="M78 6v6M96 24h-6M91 11l-4 4M91 37l-4-4" strokeWidth="2.5" />
    <path d="M6 82h88" />
  </svg>
)

/* Kalem ve bir satır yazı: blog. */
export const Quill: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M30 70 70 30l10 10-40 40-14 4Z" />
    <path d="M26 84l4-14 10 10" strokeWidth="2" />
    <path d="M64 36l10 10" strokeWidth="2" />
    <path d="M18 92c10-6 20-6 30 0s20 6 30 0" strokeWidth="2.5" />
  </svg>
)

/* Tek yaprak, ortasında damar. */
export const Leaf: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M50 90C22 72 18 38 50 10c32 28 28 62 0 80Z" />
    <path d="M50 90V28M50 62 38 52M50 48l12-10" strokeWidth="2" />
  </svg>
)

/* Sapında boynunu bükmüş yaprak: soldurma. */
export const Wilted: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M34 92V44c0-16 10-26 26-26" />
    <path d="M60 18c18 6 26 24 18 46-16-4-24-20-18-46Z" />
    <path d="M62 24l12 34" strokeWidth="2" />
    <path d="M20 92h40" />
  </svg>
)

/* Kendi üstüne kıvrılmış yaprak. */
export const Curl: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M54 50a6 6 0 1 0-8 6c10 4 20-4 18-14-2-12-16-18-28-12-14 8-14 28 0 36 16 8 36-2 38-20" />
    <path d="M74 46c6-10 12-14 18-14" strokeWidth="2.5" />
  </svg>
)

/* Tepsi üstünde yükselen sıcak hava: kurutma. */
export const Heat: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M30 70c-6-8 6-14 0-22s6-14 0-22M50 70c-6-8 6-14 0-22s6-14 0-22M70 70c-6-8 6-14 0-22s6-14 0-22" />
    <path d="M16 82h68M22 82l4 8h48l4-8" />
  </svg>
)

/* Tadım kâsesi, üstünde buhar: kalite kontrol. */
export const Bowl: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M18 48h64c0 22-14 34-32 34S18 70 18 48Z" />
    <path d="M82 52c10 2 10 14 0 16" />
    <path d="M26 90h48" />
    <path d="M40 36c-2-4 2-8 0-12M52 36c-2-4 2-8 0-12M64 36c-2-4 2-8 0-12" strokeWidth="2.5" />
    <path d="M40 60l8 8 14-14" strokeWidth="2.5" />
  </svg>
)

/* Üstü katlanmış çay paketi, ortasında yaprak: paketleme. */
export const Pack: Doodle = ({ className }) => (
  <svg viewBox="0 0 100 100" {...svgProps} className={className} aria-hidden="true">
    <path d="M28 34h44v54H28Z" />
    <path d="M28 34l6-14h32l6 14M34 20v14M66 20v14" strokeWidth="2.5" />
    <path d="M50 76c-10-8-10-24 0-32 10 8 10 24 0 32Z" strokeWidth="2" />
    <path d="M50 76V54" strokeWidth="2" />
  </svg>
)

/** Lookup by name, so data files can reference doodles as plain strings. */
export const doodles = {
  glass: Glass,
  sprig: Sprig,
  teapot: Teapot,
  hills: Hills,
  quill: Quill,
  leaf: Leaf,
  wilted: Wilted,
  curl: Curl,
  heat: Heat,
  bowl: Bowl,
  pack: Pack,
} satisfies Record<string, Doodle>
export type DoodleName = keyof typeof doodles
