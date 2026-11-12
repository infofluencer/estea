import ArtPhoto from '@/components/ui/ArtPhoto'
import { factory } from '@/data/about'
import { contact } from '@/data/content'

/**
 * Fabrika: metin ve adres solda, üç kare sağda (hat geniş, koli ve sevkiyat
 * altında yan yana). Adres mağazanın iletişim sayfasıyla aynı kaynaktan.
 */
export default function Factory() {
  const [lead, ...rest] = factory.photos
  return (
    <section id="fabrika" aria-labelledby="fabrika-baslik" className="relative z-10 bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-12 lg:items-center lg:gap-8">
        <div data-reveal className="lg:col-span-6">
          <h2 id="fabrika-baslik" className="headline text-[clamp(2.2rem,4vw,3.6rem)] leading-[0.95] tracking-[-0.025em] text-brand-dark">
            {factory.title}
          </h2>
          <p className="mt-5 text-[clamp(1.2rem,1.6vw,1.4rem)] leading-[1.45] font-medium">{factory.lead}</p>
          <p className="mt-5 max-w-[46ch] text-[1.125rem] leading-[1.65] text-ink/75">{factory.body}</p>
          <address className="mt-8 text-[1.125rem] leading-[1.6] not-italic">
            <span className="block font-semibold">{contact.company}</span>
            {contact.address.map((line) => (
              <span key={line} className="block text-ink/75">
                {line}
              </span>
            ))}
            <a
              href={contact.mapHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-[1rem] font-semibold text-ink underline decoration-ink/30 decoration-[1.5px] underline-offset-[6px] transition-colors hover:decoration-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Haritada aç
            </a>
          </address>
        </div>
        <div data-reveal style={{ '--reveal-delay': '100ms' } as React.CSSProperties} className="grid gap-4 lg:col-span-6 lg:col-start-7">
          <figure>
            <div className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-linen sm:aspect-[16/10]">
              <ArtPhoto photo={lead} />
            </div>
            <figcaption className="mt-2 text-[1rem] text-ink/60">{lead.caption}</figcaption>
          </figure>
          <div className="grid grid-cols-2 gap-4">
            {rest.map((p) => (
              <figure key={p.src}>
                <div className="relative aspect-[40/39] overflow-hidden rounded-2xl bg-linen sm:aspect-[4/3]">
                  <ArtPhoto photo={p} sizes="(max-width: 1023px) 50vw, 25vw" />
                </div>
                <figcaption className="mt-2 text-[1rem] text-ink/60">{p.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
