import ArtPhoto from '@/components/ui/ArtPhoto'
import type { Post } from '@/data/posts'
import { teaBySlug } from '@/data/shelf'

/**
 * Bir yazı: kare, başlık, özet, altında tarih ve yazının çayı. `ratio`
 * karenin oranını verir; blog listesinde her çerçeve kendi oranındadır.
 */
export default function PostCard({ post, wide = false, ratio = 'sm:aspect-[4/3]', priority = false }: { post: Post; wide?: boolean; ratio?: string; priority?: boolean }) {
  const teaNames = post.teas.map((t) => teaBySlug(t.slug).short).join(' ve ')
  return (
    <article>
      <a
        href={`/blog/${post.slug}`}
        className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen"
      >
        <div className={`relative overflow-hidden rounded-2xl bg-paper ${post.imageMobile ? 'aspect-[40/39]' : 'aspect-[4/3]'} ${wide ? 'sm:aspect-[16/9]' : ratio}`}>
          <ArtPhoto
            photo={{ src: post.image, mobile: post.imageMobile }}
            priority={priority}
            className="transition-transform duration-700 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
        </div>
        <h3 className="headline mt-4 text-[clamp(1.6rem,2.3vw,2.2rem)] leading-[1.08] tracking-[-0.015em] text-ink transition-colors group-hover:text-brand">
          {post.title}
        </h3>
        <p className="mt-3 max-w-[52ch] text-[1.05rem] leading-[1.5] text-ink">{post.excerpt}</p>
        <div className="mt-3 flex flex-wrap justify-between gap-x-4 text-[1rem]">
          <time dateTime={post.date}>{post.dateLabel}</time>
          <span className="font-semibold text-brand">Yanına {teaNames}</span>
        </div>
      </a>
    </article>
  )
}
