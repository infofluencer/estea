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

