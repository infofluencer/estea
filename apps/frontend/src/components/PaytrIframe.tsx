"use client"

import { useEffect, useRef, useState } from "react"

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
 * Form gelene kadar yerinde bir iskelet durur (boş beyaz kutu yerine).
 * iframe her yüklendiğinde (kart formu, sonra bankanın 3D adımı) ekranda ortalanır;
 * 3D onay kutusu sayfanın aşağısında ya da başlığın altında kalmasın.
 *
 * ÖNEMLİ: merchant_ok_url'e ulaşmak ödeme onayı DEĞİLDİR.
 * Gerçek onay /paytr/callback webhook'undan gelir.
 */
export function PaytrIframe({ iframeToken }: Props) {
  const scriptLoaded = useRef(false)
  const [loaded, setLoaded] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  // Yükleme sonrası iframeResizer yüksekliği değiştirir; ortalama yükseklik oturunca yapılır.
  const centerTimer = useRef<number | null>(null)

  const centerFrame = () => {
    centerTimer.current = null
    const frame = frameRef.current
    if (!frame) return
    // Başlık (compact) yüksekliği :root scroll-padding-top'ta; scrollIntoView onu hesaba katar.
    const fits = frame.getBoundingClientRect().height <= window.innerHeight * 0.85
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    frame.scrollIntoView({ block: fits ? "center" : "start", behavior: reduce ? "auto" : "smooth" })
  }

  const scheduleCenter = () => {
    if (centerTimer.current) window.clearTimeout(centerTimer.current)
    centerTimer.current = window.setTimeout(centerFrame, 350)
  }

  useEffect(
    () => () => {
      if (centerTimer.current) window.clearTimeout(centerTimer.current)
    },
    []
  )

  useEffect(() => {
    if (scriptLoaded.current) return
    scriptLoaded.current = true

    const script = document.createElement("script")
    script.src = "https://www.paytr.com/js/iframeResizer.min.js"
    script.onload = () => {
      if (typeof (window as { iFrameResize?: (opts: unknown, sel: string) => void }).iFrameResize === "function") {
        ;(window as { iFrameResize?: (opts: unknown, sel: string) => void }).iFrameResize!(
          // Yükseklik değişince (3D adımı) bekleyen ortalama yeni boya göre yapılır.
          { resizedCallback: () => centerTimer.current && scheduleCenter() },
          "#paytriframe"
        )
      }
    }
    document.body.appendChild(script)
  }, [])

  return (
    <div className="paytr-frame" data-loaded={loaded ? "true" : "false"}>
      {loaded ? null : (
        <div className="paytr-frame__skeleton" aria-hidden>
          <span className="paytr-frame__bone paytr-frame__bone--title" />
          <span className="paytr-frame__bone" />
          <span className="paytr-frame__bone paytr-frame__bone--half" />
          <span className="paytr-frame__bone paytr-frame__bone--half" />
          <span className="paytr-frame__bone paytr-frame__bone--cta" />
        </div>
      )}
      <iframe
        ref={frameRef}
        id="paytriframe"
        data-testid="paytr-iframe"
        src={`https://www.paytr.com/odeme/guvenli/${iframeToken}`}
        frameBorder={0}
        scrolling="no"
        style={{ width: "100%", minHeight: 600 }}
        title="PayTR Güvenli Ödeme"
        onLoad={() => {
          setLoaded(true)
          scheduleCenter()
        }}
      />
    </div>
  )
}
