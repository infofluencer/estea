"use client"

import { useEffect, useRef } from "react"

type Props = {
  iframeToken: string
}

/**
 * PayTR iFrame ödeme formu.
 *
 * Kullanım:
 *   <PaytrIframe iframeToken="28cc613c..." />
 *
 * iframeResizer PayTR CDN'inden yüklenir; iframe yüksekliğini otomatik ayarlar.
 *
 * ÖNEMLİ: merchant_ok_url'e ulaşmak ödeme onayı DEĞİLDİR.
 * Gerçek onay /paytr/callback webhook'undan gelir.
 */
export function PaytrIframe({ iframeToken }: Props) {
  const scriptLoaded = useRef(false)

  useEffect(() => {
    if (scriptLoaded.current) return
    scriptLoaded.current = true

    const script = document.createElement("script")
    script.src = "https://www.paytr.com/js/iframeResizer.min.js"
    script.onload = () => {
      if (typeof (window as { iFrameResize?: (opts: unknown, sel: string) => void }).iFrameResize === "function") {
        ;(window as { iFrameResize?: (opts: unknown, sel: string) => void }).iFrameResize!(
          {},
          "#paytriframe"
        )
      }
    }
    document.body.appendChild(script)
  }, [])

  return (
    <iframe
      id="paytriframe"
      data-testid="paytr-iframe"
      src={`https://www.paytr.com/odeme/guvenli/${iframeToken}`}
      frameBorder={0}
      scrolling="no"
      style={{ width: "100%", minHeight: 600 }}
      title="PayTR Güvenli Ödeme"
    />
  )
}
