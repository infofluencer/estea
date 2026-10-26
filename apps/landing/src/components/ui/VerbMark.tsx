import type { ReactNode } from 'react'

/**
 * The Journey verb as a label off the pack: a pill in the step's colour with
 * an ink outline and a hard ink shadow, set a degree off true. The word
 * stays cream throughout; only the pill changes colour from step to step.
 * `tilt` alternates the lean so neighbouring labels do not line up.
 */
export default function VerbMark({ color, tilt = 1, children }: { color: string; tilt?: 1 | -1; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full border-[3px] border-ink px-[0.45em] py-[0.08em] text-cream ${tilt === 1 ? 'rotate-1' : '-rotate-1'}`}
      style={{ backgroundColor: color, boxShadow: '0.12em 0.12em 0 var(--color-ink)' }}
    >
      {children}
    </span>
  )
}
