import Image from 'next/image'
import { blog } from '@/data/content'
import Btn from '@/components/ui/Btn'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

/**
 * Blog as a corporate card grid: photo, date, title, read-more. The intro
 * and the "all posts" link sit in a sticky column on the left.
 */
export default function Blog() {
  return (
    <section id="blog" aria-labelledby="blog-baslik" className="relative z-10 bg-linen py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-14 px-5 sm:px-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-3">
          <div className="lg:sticky lg:top-24">
            <h2 id="blog-baslik" className="headline text-[clamp(2rem,3vw,2.75rem)] leading-[1] tracking-[-0.02em] text-ink">
              {blog.title}
            </h2>
            <p className="mt-5 max-w-[28ch] text-[1.1rem] leading-[1.5] text-ink/80">{blog.lead}</p>
            <div className="mt-8">
              <Btn href={blog.all.href} variant="brand" external>
                {blog.all.label}
              </Btn>
            </div>
          </div>
        </div>

        <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:col-span-9 lg:grid-cols-3">
          {blog.posts.map((post) => (
            <li key={post.href}>
              <a
                href={post.href}
                {...ext}
                className="group block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-4 focus-visible:ring-offset-linen"
              >
                <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-paper">
                  <Image
                    src={post.image}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <p className="mt-4 text-[0.82rem] font-semibold tracking-[0.08em] text-ink/60 uppercase">{post.date}</p>
                <h3 className="mt-2 text-[1.25rem] leading-[1.25] font-bold text-ink transition-colors group-hover:text-brand">
                  {post.title}
                </h3>
                <p className="mt-3 text-[0.95rem] font-semibold text-brand">
                  Devamını oku
                  <span className="ml-2 inline-block transition-transform group-hover:translate-x-1" aria-hidden="true">
                    →
                  </span>
                </p>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
