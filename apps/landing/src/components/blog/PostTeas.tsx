import Image from 'next/image'
import Btn from '@/components/ui/Btn'
import { blogPage, type Post } from '@/data/posts'
import { shelf, teaBySlug } from '@/data/shelf'

/** Yazının yanında duran paket(ler): neden bu çay, mağazaya tek adım. */
export default function PostTeas({ post }: { post: Post }) {
  return (
    <aside aria-labelledby="yazinin-cayi" className="flex flex-col gap-4">
      <h2 id="yazinin-cayi" className="headline text-[clamp(1.5rem,2vw,1.9rem)] leading-[1.05] tracking-[-0.015em]">
        {blogPage.side}
      </h2>
      {post.teas.map(({ slug, why }) => {
        const tea = teaBySlug(slug)
        return (
          <div key={slug} className={`rounded-2xl p-5 ${tea.soft}`}>
            <div className="relative mx-auto aspect-[4/3] max-w-[15rem]">
              <Image src={tea.image} alt="" fill sizes="240px" className="object-contain" />
            </div>
            <h3 className="headline mt-3 text-[1.4rem] leading-[1.1]">{tea.name}</h3>
            <p className="mt-2 text-[1.05rem] leading-[1.5]">{why}</p>
            <div className="mt-4">
              <Btn href={tea.href} variant="brand" external>
                {shelf.cta}
              </Btn>
            </div>
          </div>
        )
      })}
    </aside>
  )
}
