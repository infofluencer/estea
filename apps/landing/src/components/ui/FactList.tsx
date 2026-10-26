/**
 * The two facts under a Journey step as one ticket stub: an ink-outlined
 * slip with a perforated divider between the facts. Each term is set in the
 * step's colour, the value beneath it in the display face. On narrow
 * screens the stub stacks and the perforation runs across instead.
 */
type Fact = { readonly term: string; readonly value: string }

export default function FactList({ color, facts }: { color: string; facts: readonly Fact[] }) {
  return (
    <dl className="mt-8 inline-grid overflow-hidden rounded-xl border-2 border-ink sm:grid-cols-2">
      {facts.map((f, j) => (
        <div key={f.term} className={`px-5 py-4 ${j > 0 ? 'border-t-2 border-dashed border-ink/40 sm:border-t-0 sm:border-l-2' : ''}`}>
          <dt className="label" style={{ color }}>
            {f.term}
          </dt>
          <dd className="headline mt-1.5 text-[1.2rem] leading-[1.1]">{f.value}</dd>
        </div>
      ))}
    </dl>
  )
}
