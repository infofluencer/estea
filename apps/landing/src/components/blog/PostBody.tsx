import type { PostBlock } from '@/data/posts'

/* Liste işaretleri bahçeden bardağa renk sırasında döner. */
const marks = ['bg-leaf text-ink', 'bg-gold text-ink', 'bg-amber text-cream', 'bg-brand text-cream']

/** Yazı gövdesi: paragraflar tam mürekkepte, ara başlıklar Bricolage, listeler renkli disklerle. */
export default function PostBody({ blocks }: { blocks: readonly PostBlock[] }) {
  return (
    <div className="flex flex-col gap-6 text-[1.2rem] leading-[1.65] text-ink">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'h2':
            return (
              <h2 key={i} className="headline mt-6 text-[clamp(1.8rem,2.6vw,2.4rem)] leading-[1.05] tracking-[-0.02em]">
                {b.text}
              </h2>
            )
          case 'h3':
            return (
              <h3 key={i} className="headline mt-2 text-[clamp(1.35rem,1.8vw,1.6rem)] leading-[1.1]">
                {b.text}
              </h3>
            )
          case 'ol':
          case 'ul': {
            const Tag = b.type
            return (
              <Tag key={i} className="flex flex-col gap-4">
                {b.items.map((item, j) => (
                  <li key={item} className="flex items-start gap-4">
                    <span aria-hidden="true" className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.9rem] font-bold ${marks[j % marks.length]}`}>
                      {b.type === 'ol' ? j + 1 : ''}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </Tag>
            )
          }
          default:
            return <p key={i}>{b.text}</p>
        }
      })}
    </div>
  )
}
