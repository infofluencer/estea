import ArtPhoto from '@/components/ui/ArtPhoto'
import type { Post } from '@/data/posts'

/**
 * Bir yazı, ana sayfadaki blog bölümüyle aynı dilde: üstte tarih ve ok diski,
 * 4:3 kare, başlık. `wide` ilk yazıyı iki sütuna yayar ve özetini gösterir.
 */
export default function PostCard({ post, wide = false, priority = false }: { post: Post; wide?: boolean; priority?: boolean }) {
  return (
    <article className="border-t border-ink/15">
      <a
        href={`/blog/${post.slug}`}
        className="group block pt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen"
      >
        <div className="flex items-start justify-between gap-4">
          <time dateTime={post.date} className="label text-brand">
            {post.dateLabel}
          </time>
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/25 text-ink transition-colors duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-cream"
          >
            <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-200 group-hover:-rotate-45" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </span>
        </div>
        <div className={`relative mt-4 overflow-hidden rounded-2xl bg-paper ${post.imageMobile ? 'aspect-[40/39]' : 'aspect-[4/3]'} ${wide ? 'sm:aspect-[16/9] lg:aspect-[21/9]' : 'sm:aspect-[4/3]'}`}>
          <ArtPhoto
            photo={{ src: post.image, mobile: post.imageMobile }}
            priority={priority}
            className="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        </div>
        <h3 className={`headline mt-5 leading-[1.1] text-ink transition-colors group-hover:text-brand ${wide ? 'max-w-[24ch] text-[clamp(1.8rem,3vw,2.8rem)]' : 'text-[clamp(1.2rem,1.5vw,1.4rem)]'}`}>
          {post.title}
        </h3>
        {wide ? <p className="mt-3 max-w-[52ch] text-[1.1rem] leading-[1.5] text-ink/75">{post.excerpt}</p> : null}
      </a>
    </article>
  )
}
