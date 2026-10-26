import Image from 'next/image'
import { blog } from '@/data/content'
import Btn from '@/components/ui/Btn'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * Blog in the FAQ's idiom (hairlines, brand-red labels, outlined discs) but
 * with a different opening: the seal, title, lead and link form the first
 * tile of the grid, left-aligned and spanning both rows, and the six posts
 * fill the three columns beside it. No centred header, so the FAQ and the
 * blog do not open the same way twice in a row.
 */
export default function Blog() {
  return (
    <section id="blog" aria-labelledby="blog-baslik" className="relative z-10 bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-10 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:gap-y-12 xl:gap-x-12">
        <header className="border-t border-ink/15 pt-6 sm:col-span-2 lg:col-span-1 lg:row-span-2">
          <div className="lg:sticky lg:top-28">
            <Image
              src="/logo.png"
              alt=""
              width={341}
              height={182}
              className="h-20 w-auto -rotate-[8deg] drop-shadow-[0_8px_14px_rgba(0,0,0,0.22)] sm:h-24"
            />
            <h2 id="blog-baslik" className="headline mt-8 text-[clamp(2.2rem,2.7vw,2.9rem)] leading-[0.95] tracking-[-0.025em] text-ink">
              {blog.title}
            </h2>
            <p className="mt-4 max-w-[26ch] text-[1.1rem] leading-[1.5] text-ink/75">{blog.lead}</p>
            <div className="mt-8">
              <Btn href={blog.all.href} variant="brand" external>
                {blog.all.label}
              </Btn>
            </div>
          </div>
        </header>

        {blog.posts.map((post) => (
          <article key={post.href} className="border-t border-ink/15">
            <a
              href={post.href}
              {...ext}
              className="group block pt-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen"
            >
              <div className="flex items-start justify-between gap-4">
                <span className="label text-brand">{post.date}</span>
                {/* Outlined disc with an arrow; fills brand red on hover, as the FAQ plus does when open. */}
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full border border-ink/25 text-ink transition-colors duration-200 group-hover:border-brand group-hover:bg-brand group-hover:text-cream"
                >
                  <svg viewBox="0 0 16 16" className="size-4 transition-transform duration-200 group-hover:-rotate-45" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </span>
              </div>
              <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-2xl bg-paper">
                <Image
                  src={post.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 22vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <h3 className="headline mt-5 text-[clamp(1.2rem,1.5vw,1.4rem)] leading-[1.1] text-ink transition-colors group-hover:text-brand">
                {post.title}
              </h3>
            </a>
          </article>
        ))}
      </div>
    </section>
  )
}
