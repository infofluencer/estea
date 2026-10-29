import type { ButtonHTMLAttributes, ReactNode } from "react"
import Link from "next/link"
import BlobBg from "@/components/brand/BlobBg"

/** Landing ile aynı pill buton: BlobBg zemin, büyük harf, 0.14em izleme. */
export type BtnVariant =
  | "cream"
  | "ink"
  | "brand"
  | "gold"
  | "garden"
  | "outline-cream"
  | "outline-ink"

export const btnBase =
  "group relative isolate inline-flex min-h-12 items-center justify-center rounded-full px-8 text-[0.8rem] font-bold tracking-[0.14em] uppercase transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"

/* `text` etiketi ve odak halkasını, `blob` arkadaki pill'i boyar. */
export const btnVariants: Record<BtnVariant, { text: string; blob: string }> = {
  cream: { text: "text-ink focus-visible:ring-cream focus-visible:ring-offset-ink", blob: "fill-cream group-hover:fill-white" },
  ink: { text: "text-cream focus-visible:ring-ink focus-visible:ring-offset-paper", blob: "fill-ink group-hover:fill-moss" },
  brand: { text: "text-cream focus-visible:ring-brand focus-visible:ring-offset-paper", blob: "fill-brand group-hover:fill-brand-dark" },
  gold: {
    text: "text-ink hover:text-cream focus-visible:text-cream focus-visible:ring-gold focus-visible:ring-offset-ink",
    blob: "fill-gold group-hover:fill-amber",
  },
  garden: { text: "text-cream focus-visible:ring-garden focus-visible:ring-offset-linen", blob: "fill-garden group-hover:fill-olive" },
  "outline-cream": {
    text: "text-cream focus-visible:ring-cream focus-visible:ring-offset-ink",
    blob: "fill-cream/0 stroke-cream/50 [stroke-width:1.25] group-hover:fill-cream/10 group-hover:stroke-cream",
  },
  "outline-ink": {
    text: "text-ink focus-visible:ring-ink focus-visible:ring-offset-paper",
    blob: "fill-ink/0 stroke-ink/30 [stroke-width:1.25] group-hover:fill-ink/5 group-hover:stroke-ink",
  },
}

type Common = { children: ReactNode; variant?: BtnVariant; className?: string }

export function Btn({
  href,
  children,
  variant = "ink",
  external,
  className = "",
}: Common & { href: string; external?: boolean }) {
  const cls = `${btnBase} ${btnVariants[variant].text} ${className}`
  const inner = (
    <>
      <BlobBg className={btnVariants[variant].blob} />
      <span className="blob-label">{children}</span>
    </>
  )
  if (external || /^https?:/.test(href)) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  )
}

export function BtnButton({
  children,
  variant = "ink",
  className = "",
  ...rest
}: Common & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">) {
  return (
    <button type="button" {...rest} className={`${btnBase} ${btnVariants[variant].text} ${className}`}>
      <BlobBg className={btnVariants[variant].blob} />
      <span className="blob-label">{children}</span>
    </button>
  )
}
