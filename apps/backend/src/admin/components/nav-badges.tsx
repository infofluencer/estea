import { useEffect } from "react"

type Counts = { returns: number; orders: number }

/** Kenar çubuğu linki (href sonu) → sayaç alanı. */
const TARGETS: { suffix: string; key: keyof Counts; title: string }[] = [
  { suffix: "/iadeler", key: "returns", title: "Bekleyen / sorunlu iade" },
  { suffix: "/orders", key: "orders", title: "Kargolanacak + havale bekleyen sipariş" },
]

const BADGE_CLASS = "escay-nav-badge"
const POLL_MS = 60_000

let counts: Counts | null = null
let timer: number | null = null
let observer: MutationObserver | null = null
let mounted = 0
let frame: number | null = null

function schedulePaint() {
  if (frame !== null) return
  frame = window.requestAnimationFrame(() => {
    frame = null
    paint()
  })
}

function paint() {
  if (!counts) return
  for (const t of TARGETS) {
    const links = document.querySelectorAll<HTMLAnchorElement>(`nav a[href$="${t.suffix}"]`)
    links.forEach((a) => {
      let badge = a.querySelector<HTMLSpanElement>(`.${BADGE_CLASS}`)
      const n = counts![t.key]
      if (!n) {
        badge?.remove()
        return
      }
      if (!badge) {
        badge = document.createElement("span")
        badge.className = BADGE_CLASS
        badge.style.cssText =
          "margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:9px;" +
          "background:var(--tag-red-icon,#e5484d);color:#fff;font-size:11px;font-weight:600;" +
          "display:inline-flex;align-items:center;justify-content:center;line-height:1"
        a.appendChild(badge)
      }
      // Yalnız değişince yaz — aksi halde MutationObserver kendini tetikler.
      const text = n > 99 ? "99+" : String(n)
      if (badge.textContent !== text) badge.textContent = text
      if (badge.title !== t.title) badge.title = t.title
    })
  }
}

async function refresh() {
  try {
    const res = await fetch("/admin/escay-nav-counts", { credentials: "include" })
    if (!res.ok) return
    counts = (await res.json()) as Counts
    paint()
  } catch {
    // ağ hatası — bir sonraki turda tekrar
  }
}

/**
 * Kenar çubuğunda "İadeler" ve "Siparişler" yanında yapılacak iş sayısı.
 * Medusa menüsü genişletilemediği için sayılar DOM'a rozet olarak eklenir;
 * birden çok sayfada mount edilse de tek zamanlayıcı çalışır.
 */
export function useNavBadges() {
  useEffect(() => {
    mounted++
    if (mounted === 1) {
      void refresh()
      timer = window.setInterval(() => void refresh(), POLL_MS)
      // Menü yeniden çizilince (sayfa geçişi) rozet kaybolmasın.
      observer = new MutationObserver(() => schedulePaint())
      observer.observe(document.body, { childList: true, subtree: true })
    } else {
      paint()
    }
    return () => {
      mounted--
      if (mounted === 0) {
        if (timer) window.clearInterval(timer)
        observer?.disconnect()
        timer = null
        observer = null
      }
    }
  }, [])
}

export function NavBadges() {
  useNavBadges()
  return null
}
