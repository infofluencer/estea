import type { ReactNode } from 'react'
import BlobBg from '@/components/ui/BlobBg'

type Variant = 'cream' | 'ink' | 'brand' | 'gold' | 'outline-cream' | 'outline-ink'

const base =
  'group relative isolate inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[0.8rem] font-bold tracking-[0.14em] uppercase transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2'

/* `text` styles the label and focus ring; `blob` colours the pill behind it. */
const variants: Record<Variant, { text: string; blob: string }> = {
  cream: { text: 'text-ink focus-visible:ring-cream focus-visible:ring-offset-ink', blob: 'fill-cream group-hover:fill-white' },
  ink: { text: 'text-cream focus-visible:ring-ink focus-visible:ring-offset-paper', blob: 'fill-ink group-hover:fill-moss' },
  brand: { text: 'text-cream focus-visible:ring-brand focus-visible:ring-offset-paper', blob: 'fill-brand group-hover:fill-brand-dark' },
  gold: {
    text: 'text-brand-dark hover:text-cream focus-visible:text-cream focus-visible:ring-gold focus-visible:ring-offset-ink',
    blob: 'fill-gold group-hover:fill-brand',
  },
  'outline-cream': {
    text: 'text-cream focus-visible:ring-cream focus-visible:ring-offset-ink',
    blob: 'fill-cream/0 stroke-cream/50 [stroke-width:1.25] group-hover:fill-cream/10 group-hover:stroke-cream',
  },
  'outline-ink': {
    text: 'text-ink focus-visible:ring-ink focus-visible:ring-offset-paper',
    blob: 'fill-ink/0 stroke-ink/30 [stroke-width:1.25] group-hover:fill-ink/5 group-hover:stroke-ink',
  },
}

export default function Btn({
  href,
  children,
  variant = 'cream',
  external,
  className = '',
}: {
  href: string
  children: ReactNode
  variant?: Variant
  external?: boolean
  className?: string
}) {
  return (
    <a
      href={href}
      className={`${base} ${variants[variant].text} ${className}`}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      <BlobBg className={variants[variant].blob} />
      <span className="blob-label">{children}</span>
    </a>
  )
}
