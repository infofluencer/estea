import type { ButtonHTMLAttributes, ReactNode } from "react"
import Link from "next/link"

/** Kurumsal buton: 6px köşe, düz yazım, 600 ağırlık. Kırmızı (brand/gold) birincil eylemdir. */
export type BtnVariant =
  | "cream"
  | "ink"
  | "brand"
  | "gold"
  | "garden"
  | "outline-cream"
  | "outline-ink"

export const btnBase =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[6px] px-6 text-[0.95rem] font-semibold leading-none transition-colors duration-150 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"

export const btnVariants: Record<BtnVariant, string> = {
  brand: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand",
  gold: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand",
  ink: "bg-ink text-white hover:bg-ink-soft focus-visible:ring-ink",
  garden: "bg-shell text-white hover:bg-shell-dark focus-visible:ring-ink",
  cream: "bg-white text-ink hover:bg-surface focus-visible:ring-white focus-visible:ring-offset-ink",
  "outline-cream":
    "border border-white/70 text-white hover:bg-white hover:text-ink focus-visible:ring-white focus-visible:ring-offset-ink",
  "outline-ink": "border border-line-strong text-ink hover:border-ink focus-visible:ring-ink",
}

type Common = { children: ReactNode; variant?: BtnVariant; className?: string }

export function Btn({
  href,
  children,
  variant = "ink",
  external,
  className = "",
}: Common & { href: string; external?: boolean }) {
  const cls = `${btnBase} ${btnVariants[variant]} ${className}`
  if (external || /^https?:/.test(href)) {
    return (
      <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
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
    <button type="button" {...rest} className={`${btnBase} ${btnVariants[variant]} ${className}`}>
      {children}
    </button>
  )
}
