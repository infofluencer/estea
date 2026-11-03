import type { Tone } from '@/data/content'

/** Harman tonundan buton rengine. */
export const btnVariant = { gold: 'gold', leaf: 'garden', brand: 'brand', sun: 'amber' } as const satisfies Record<Tone, string>
