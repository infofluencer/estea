import Link from "next/link"

type CategoryBannerProps = {
  href: string
  label: string
  desktop: string
  mobile: string
}

/** Full-width category banner; the category name is part of the artwork. */
export function CategoryBanner({ href, label, desktop, mobile }: CategoryBannerProps) {
  return (
    <Link href={href} className="home-banner" aria-label={label}>
      <picture>
        <source media="(max-width: 720px)" srcSet={mobile} />
        <img
          className="home-banner__image"
          src={desktop}
          alt={label}
          loading="lazy"
          decoding="async"
        />
      </picture>
    </Link>
  )
}
