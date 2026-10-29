import type { ReactNode } from "react"
import type { SpecIconName } from "@/lib/spec-labels"

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

export function SpecIcon({ name }: { name: SpecIconName }) {
  switch (name) {
    case "ruler":
      return (
        <Svg>
          <path d="M4 20 20 4" />
          <path d="m8 16 1-1M11 13l1-1M14 10l1-1" />
        </Svg>
      )
    case "wash":
      return (
        <Svg>
          <path d="M12 3c3 4.5 6 7.8 6 11a6 6 0 1 1-12 0c0-3.2 3-6.5 6-11Z" />
        </Svg>
      )
    case "texture":
      return (
        <Svg>
          <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
        </Svg>
      )
    case "volume":
      return (
        <Svg>
          <path d="M8 4h8l4 6-8 10L4 10l4-6Z" />
        </Svg>
      )
    case "scent":
      return (
        <Svg>
          <path d="M12 21a5 5 0 0 0 5-5c0-3-5-5-5-9 0 4-5 6-5 9a5 5 0 0 0 5 5Z" />
        </Svg>
      )
    case "flame":
      return (
        <Svg>
          <path d="M12 3c2 4-3 5.5-1 9 3 0 6-2 6-6 3 3 3 8 0 11a6 6 0 1 1-10.4-4.1C8 10 10 7 12 3Z" />
        </Svg>
      )
    case "flask":
      return (
        <Svg>
          <path d="M9 3h6M10 3v5.5L5.5 20h13L14 8.5V3" />
        </Svg>
      )
    case "spark":
      return (
        <Svg>
          <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.2 6.2l2.8 2.8M15 15l2.8 2.8M17.8 6.2 15 9M9 15l-2.8 2.8" />
        </Svg>
      )
    default:
      return (
        <Svg>
          <path d="M7 3h7l5 5v13H7z" />
          <path d="M14 3v5h5" />
        </Svg>
      )
  }
}
