import { blog } from '@/data/content'
import { doodles } from '@/components/ui/Doodles'
import Btn from '@/components/ui/Btn'

/**
 * The blog as an index, not a card grid: each post is one large linked title
 * with its doodle disc, in the same coloured-disc language as the rest of the page.
 */
export default function Blog() {
  return (
    <section id="blog" aria-labelledby="blog-baslik" className="relative z-10 bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-24">
            <h2
              id="blog-baslik"
              className="headline text-[clamp(2.8rem,5.6vw,5.4rem)] leading-[0.92] tracking-[-0.03em] text-garden-dark"
            >
              {blog.title}
            </h2>
            <p className="mt-5 max-w-[28ch] text-[1.1rem] leading-[1.5] font-medium sm:text-[1.2rem]">{blog.lead}</p>
            <div className="mt-8">
              <Btn href={blog.all.href} variant="brand" external>
                {blog.all.label}
              </Btn>
            </div>
          </div>
        </div>

        <ol className="flex flex-col gap-3 lg:col-span-8">
          {blog.posts.map((post) => {
            const Icon = doodles[post.icon]
            return (
              <li key={post.href}>
                <a
                  href={post.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group grid grid-cols-[64px_1fr] items-center gap-5 rounded-[2rem] px-3 py-4 transition-colors duration-200 hover:bg-gold focus:outline-none focus-visible:bg-gold focus-visible:ring-2 focus-visible:ring-ink sm:grid-cols-[80px_1fr_auto] sm:gap-7 sm:px-4"
                >
                  <span
                    className={`flex h-16 w-16 items-center justify-center rounded-full transition-transform duration-300 group-hover:-rotate-12 sm:h-20 sm:w-20 ${post.disc}`}
                  >
                    <Icon className="h-10 w-10 sm:h-12 sm:w-12" />
                  </span>
                  <span>
                    <span className="headline block text-[clamp(1.5rem,2.6vw,2.3rem)] leading-[1.02] transition-colors group-hover:text-brand-dark">
                      {post.title}
                    </span>
                    {post.date && <span className="mt-1.5 block text-[0.95rem] text-ink/65 transition-colors group-hover:text-ink sm:hidden">{post.date}</span>}
                  </span>
                  <span className="hidden text-[0.95rem] whitespace-nowrap text-ink/65 transition-colors group-hover:text-ink sm:block">
                    {post.date ?? ''}
                    <span className="ml-3 inline-block transition-transform group-hover:translate-x-1" aria-hidden="true">
                      →
                    </span>
                  </span>
                </a>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
