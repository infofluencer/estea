import Image from 'next/image'

/**
 * The Esçay seal set across the seam between two sections, half on each, so
 * the edge of the section above (the patterned ground, say) is what divides
 * the page; no rules. Place it between the two sections.
 */
export default function SectionRule() {
  return (
    <div aria-hidden="true" className="relative z-20 flex h-0 justify-center">
      <Image
        src="/logo.png"
        alt=""
        width={341}
        height={182}
        className="h-14 w-auto -translate-y-1/2 -rotate-[6deg] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)] sm:h-[4.5rem]"
      />
    </div>
  )
}
