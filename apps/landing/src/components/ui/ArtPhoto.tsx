import type { CSSProperties } from 'react'
import { getImageProps } from 'next/image'

export type ArtSource = { src: string; alt?: string; /** Telefon kırpımı (fotoğraf brief'i mobil kareleri, 400×390). */ mobile?: string; focus?: string }

/** Çoğu kare telefonda tam genişlik, masaüstünde ızgaranın yarısı kadar. */
const DEFAULT_SIZES = '(max-width: 1023px) 100vw, 50vw'

/**
 * Fotoğraf brief'inin iki kırpımı tek karede: telefonda (640 px altı) kare
 * mobil kırpım, üstünde masaüstü karesi. Çerçeveyi veren kapsayıcı
 * `relative` olmalı; bu bileşen onu doldurur. Mobil kırpım yoksa yalnız
 * masaüstü karesi kullanılır. İki kırpım da Next optimizer'ından ekran
 * genişliğine göre AVIF/WebP olarak gelir.
 */
export default function ArtPhoto({
  photo,
  alt = photo.alt ?? '',
  priority = false,
  sizes = DEFAULT_SIZES,
  className = '',
}: {
  photo: ArtSource
  alt?: string
  priority?: boolean
  /** Karenin ekrandaki genişliği; srcset'ten doğru boy seçilsin. */
  sizes?: string
  className?: string
}) {
  const common = { alt, fill: true, sizes } as const
  const {
    props: { srcSet: desktop, style: _style, ...img },
  } = getImageProps({ ...common, src: photo.src })
  const mobile = photo.mobile
    ? getImageProps({ ...common, src: photo.mobile, sizes: '100vw' }).props.srcSet
    : undefined
  const style: CSSProperties | undefined = photo.focus ? { objectPosition: photo.focus } : undefined
  return (
    <picture>
      {mobile ? <source media="(max-width: 639px)" srcSet={mobile} sizes="100vw" /> : null}
      <img
        {...img}
        srcSet={desktop}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        style={style}
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    </picture>
  )
}
