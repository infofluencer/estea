type IconProps = {
  className?: string
}

export function IconPackage({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 4l10 5v14l-10 5-10-5V9l10-5z" />
      <path d="M16 4v24M6 9l10 5 10-5" />
    </svg>
  )
}

export function IconHeadphones({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 18v-4a10 10 0 0 1 20 0v4" />
      <rect x="4" y="18" width="5" height="8" rx="2" />
      <rect x="23" y="18" width="5" height="8" rx="2" />
    </svg>
  )
}

export function IconShieldCheck({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 4l9 3v9c0 6-4 10-9 12-5-2-9-6-9-12V7l9-3z" />
      <path d="M11 15l3 3 6-6" />
    </svg>
  )
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M8 12V8H4" />
      <path d="M4 12a10 10 0 0 1 17-3" />
      <path d="M24 20v4h4" />
      <path d="M28 20a10 10 0 0 1-17 3" />
    </svg>
  )
}

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.15"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
