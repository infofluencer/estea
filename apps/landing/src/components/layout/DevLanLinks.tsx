'use client'

import { useEffect } from 'react'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Yalnız `next dev`: landing telefondan Mac'in ağ IP'siyle açıldığında
 * mağaza linkleri (NEXT_PUBLIC_SHOP_URL=http://localhost:3025) telefonun kendisine
 * gider. Tıklanan localhost linkinin host'u sayfanın host'uyla değiştirilir.
 */
export function DevLanLinks() {
  useEffect(() => {
    const pageHost = window.location.hostname
    if (LOOPBACK.has(pageHost)) return
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      try {
        const u = new URL(a.href)
        if (!LOOPBACK.has(u.hostname)) return
        u.hostname = pageHost
        a.href = u.toString()
      } catch {
        /* geçersiz href: dokunma */
      }
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
