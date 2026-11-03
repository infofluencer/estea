import type { CSSProperties } from 'react'

export type ArtSource = { src: string; alt?: string; /** Telefon kırpımı (fotoğraf brief'i mobil kareleri, 400×390). */ mobile?: string; focus?: string }

/**
 * Fotoğraf brief'inin iki kırpımı tek karede: telefonda (640 px altı) kare
 * mobil kırpım, üstünde masaüstü karesi. Çerçeveyi veren kapsayıcı
 * `relative` olmalı; bu bileşen onu doldurur. Mobil kırpım yoksa yalnız
 * masaüstü karesi kullanılır.
 */
export default function ArtPhoto({
  photo,
  alt = photo.alt ?? '',
  priority = false,
  className = '',
}: {
  photo: ArtSource
  alt?: string
  priority?: boolean
  className?: string
}) {
  const style: CSSProperties | undefined = photo.focus ? { objectPosition: photo.focus } : undefined
  return (
    <picture>
      {photo.mobile ? <source media="(max-width: 639px)" srcSet={photo.mobile} /> : null}
      <img
        src={photo.src}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        style={style}
        className={`absolute inset-0 h-full w-full object-cover ${className}`}
      />
    </picture>
  )
}
