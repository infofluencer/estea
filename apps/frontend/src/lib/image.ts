import { getImageProps } from "next/image"
import { SITE_HOST } from "@/lib/site"

/**
 * Ürün/kategori görselleri Medusa'dan mutlak adresle gelir ve ham <img> ile
 * basılırdı (kartlarda 50–260 KB JPEG). Bu yardımcı, güvenle optimize
 * edilebilecek adresleri Next görsel optimizer'ından ekrana uygun genişlikte
 * AVIF/WebP srcset'e çevirir; tanımadığı host'u olduğu gibi bırakır, böylece
 * next.config `remotePatterns` dışındaki bir adres asla kırılmaz.
 *
 * - Sitenin kendi adresi (market.esteacay.com/www) → göreli yol, yerel dosya.
 * - *.esteacay.com (CDN, API) → uzak desen (next.config.ts ile aynı).
 * - localhost / 127.0.0.1 → yalnız `next dev`; telefondan ağ IP'siyle açınca
 *   da görünür, çünkü görseli sunucu çeker.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1"])
const isDev = process.env.NODE_ENV === "development"

function optimizable(src: string): string | null {
  // Yerel dosyada sorgu dizesi localPatterns ister; dosya yolu yeterli.
  if (src.startsWith("/") && !src.startsWith("//")) return src.split(/[?#]/)[0]
  let u: URL
  try {
    u = new URL(src)
  } catch {
    return null
  }
  if (u.hostname === SITE_HOST || u.hostname === `www.${SITE_HOST}`) return u.pathname
  if (u.protocol === "https:" && u.hostname.endsWith(".esteacay.com")) return src
  if (isDev && u.protocol === "http:" && LOOPBACK.has(u.hostname)) return src
  return null
}

export type OptimizedImg = { src?: string; srcSet?: string; sizes?: string }

/**
 * `<img>`'e yayılacak src/srcSet/sizes. `sizes` görselin ekrandaki genişliği
 * (ör. "(max-width: 767px) 50vw, 25vw"); tarayıcı srcset'ten ona göre seçer.
 */
export function optimizedImg(src: string | null | undefined, sizes: string): OptimizedImg {
  if (!src) return {}
  const target = optimizable(src)
  if (!target) return { src }
  const { props } = getImageProps({ src: target, alt: "", fill: true, sizes })
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes }
}

/** Ürün kartı ızgarası: telefonda 2, tablette 3, masaüstünde 4 sütun. */
export const CARD_SIZES = "(max-width: 767px) 50vw, (max-width: 1199px) 33vw, 25vw"
