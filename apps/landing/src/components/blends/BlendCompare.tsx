import Image from 'next/image'
import { blends, compare } from '@/data/blends'

/**
 * Dört harman tek tabloda: sütun başında paket ve ad, satırlarda yaprak,
 * elek, içim, dem ve paketler. Satırlar çizgiyle değil zemin tonuyla ayrılır.
 * Dar ekranda tablo yerine her harman kendi listesiyle alt alta gelir.
 */
export default function BlendCompare() {
  return (
    <section id="karsilastir" aria-labelledby="karsilastir-baslik" className="relative z-10 bg-paper py-24 text-ink sm:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <h2 id="karsilastir-baslik" data-reveal className="headline text-[clamp(2.4rem,4.6vw,4rem)] leading-[0.95] tracking-[-0.025em] text-olive">
          {compare.title}
        </h2>

        <table className="mt-10 hidden w-full border-separate border-spacing-0 text-left md:table lg:mt-14" data-reveal>
          <thead>
            <tr>
              <td />
              {blends.map((b) => (
                <th key={b.slug} scope="col" className="px-4 pb-5 align-bottom font-normal">
                  <span className="relative block aspect-square w-28 lg:w-36">
                    <Image src={b.image} alt="" fill sizes="144px" className="object-contain" />
                  </span>
                  <span className="headline mt-3 block text-[1.35rem] leading-none" style={{ color: b.color }}>
                    {b.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compare.rows.map((row) => (
              <tr key={row.key} className="group">
                <th scope="row" className="headline rounded-l-xl py-5 pr-6 pl-4 text-[1.1rem] leading-[1.1] font-bold whitespace-nowrap group-odd:bg-paper">
                  {row.term}
                </th>
                {blends.map((b) => (
                  <td key={b.slug} className="px-4 py-5 align-top text-[1rem] leading-[1.5] last:rounded-r-xl group-odd:bg-paper">
                    {b.compare[row.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="mt-10 flex flex-col gap-10 md:hidden">
          {blends.map((b, i) => (
            <li key={b.slug} data-reveal style={{ '--reveal-delay': `${(i % 2) * 80}ms` } as React.CSSProperties} className="grid grid-cols-[5rem_1fr] items-start gap-x-5">
              <span className="relative block aspect-square w-20">
                <Image src={b.image} alt="" fill sizes="80px" className="object-contain" />
              </span>
              <div>
                <h3 className="headline text-[1.5rem] leading-none" style={{ color: b.color }}>
                  {b.name}
                </h3>
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[1rem] leading-[1.45]">
                  {compare.rows.map((row) => (
                    <div key={row.key} className="contents">
                      <dt className="font-bold">{row.term}</dt>
                      <dd className="text-ink/80">{b.compare[row.key]}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
