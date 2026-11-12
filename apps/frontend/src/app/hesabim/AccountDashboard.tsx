"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  changePasswordAction,
  createCustomerAddressAction,
  deleteCustomerAddressAction,
  updateCustomerAddressAction,
  updateCustomerProfileAction,
  type AddressInput,
} from "@/lib/auth/account-actions"
import { logoutAction } from "@/lib/auth/actions"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  authPasswordTooShortMessage,
} from "@/lib/auth/constants"
import {
  listTrDistricts,
  type TrCityOption,
} from "@/lib/checkout-address"
import { NeighbourhoodSelect } from "@/components/checkout/NeighbourhoodSelect"
import { normalizeTrPhone, trCityCodeForName } from "@escay/shared/tr-address"
import { useFavorites } from "@/components/FavoritesProvider"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"
import { COMPANY } from "@/lib/company"
import { resolveOrderNumberLabel } from "@escay/shared/order-number"
import {
  ORDER_STATUS_BADGE,
  formatOrderStatusLabel,
  resolveOrderTimeline,
} from "@escay/shared/order-timeline"
import { isReturnRejected, resolveReturnStatus } from "@escay/shared/return-status"
import styles from "./account.module.css"
import { productPath } from "@/lib/urls"
import { optimizedImg } from "@/lib/image"

type CustomerView = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  created_at?: string | null
}

type OrderView = {
  id: string
  display_id?: number | null
  created_at?: string | null
  total?: number | null
  status?: string | null
  metadata?: Record<string, unknown> | null
  return_status?: string | null
  return_meta?: Record<string, unknown> | null
  items?: {
    id?: string
    title?: string | null
    quantity?: number | null
    thumbnail?: string | null
    unit_price?: number | null
    variant_title?: string | null
  }[]
  item_count?: number
  fulfillments?: {
    shipped_at?: string | null
    delivered_at?: string | null
    labels?: { tracking_number?: string | null }[] | null
  }[]
  payment_collections?: { status?: string | null }[] | null
}

type AddressView = {
  id: string
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  postal_code?: string | null
  phone?: string | null
  metadata?: { district?: string | null; neighbourhood?: string | null } | null
}

type Tab = "dashboard" | "orders" | "returns" | "addresses" | "details" | "favorites"

type Feedback = {
  scope: "address" | "profile" | "password"
  kind: "error" | "success"
  text: string
}

/** Sekme ↔ adres çubuğu karşılığı; yenilemede ve paylaşılan bağlantıda aynı bölüm açılır. */
const TAB_HASH: Record<Tab, string> = {
  dashboard: "",
  orders: "siparisler",
  returns: "iadeler",
  addresses: "adresler",
  details: "bilgiler",
  favorites: "favoriler",
}

const emptyAddress = (): AddressInput => ({
  first_name: "",
  last_name: "",
  address_1: "",
  city: "",
  district: "",
  neighbourhood: "",
  postal_code: "",
  phone: "",
  country_code: "tr",
})

function formatOrderDate(value?: string | null) {
  if (!value) return "—"
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatMemberSince(value?: string | null) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      month: "long",
      year: "numeric",
    }).format(new Date(value))
  } catch {
    return null
  }
}

function returnStatusOf(order: OrderView) {
  return resolveReturnStatus({ status: order.return_status, metadata: order.return_meta })
}

type OrderState = "canceled" | "delivered" | "active"

function orderState(order: OrderView): OrderState {
  const status = (order.status || "").toLowerCase()
  if (status === "canceled" || status === "archived") return "canceled"
  const tl = resolveOrderTimeline(order)
  return tl.currentKey === "delivered" ? "delivered" : "active"
}

function orderNumber(order: OrderView) {
  return resolveOrderNumberLabel({ id: order.id, display_id: order.display_id })
}

function itemSummary(order: OrderView) {
  const items = order.items || []
  if (items.length === 0) return null
  const first = items[0].title || "Ürün"
  return items.length > 1 ? `${first} ve ${items.length - 1} ürün daha` : first
}

function trackingNumber(order: OrderView) {
  for (const f of order.fulfillments || []) {
    const no = f.labels?.find((l) => l.tracking_number?.trim())?.tracking_number
    if (no) return no.trim()
  }
  return null
}

/** "+905321234567" → "0532 123 45 67"; tanınmayan biçim olduğu gibi kalır. */
function formatPhone(phone?: string | null) {
  const e164 = normalizeTrPhone(phone)
  if (!e164) return phone || ""
  const d = `0${e164.slice(3)}`
  return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`
}

function districtsFor(cityName: string): string[] {
  return listTrDistricts(trCityCodeForName(cityName))
}

function addressToForm(a: AddressView): AddressInput {
  const city = a.city || ""
  const district = ((a.metadata?.district as string) || "").trim()
  return {
    first_name: a.first_name || "",
    last_name: a.last_name || "",
    address_1: a.address_1 || "",
    city,
    // Eski serbest metin ilçe listede yoksa yeniden seçtirilir.
    district: districtsFor(city).includes(district) ? district : "",
    neighbourhood: a.metadata?.neighbourhood || a.address_2 || "",
    postal_code: a.postal_code || "",
    phone: formatPhone(a.phone),
    country_code: "tr",
  }
}

function IconDashboard({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconOrders({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5 12 3.5l8 4v9l-8 4-8-4v-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="m4 7.5 8 4 8-4M12 11.5v9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function IconAddresses({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconDetails({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5.5 19.2c1.5-3 3.9-4.5 6.5-4.5s5 1.5 6.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconLogout({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M10 12h9m0 0-3-3m3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconFavorites({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconReturns({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 14 4 9l5-5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v-7a4 4 0 0 0-4-4H4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function IconChevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="m9 6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StatusPill({ order }: { order: OrderView }) {
  const ret = returnStatusOf(order)
  // Satırda tek durum işareti: iade varsa siparişin kendi durumunun yerini alır.
  const tone = ret
    ? ret.tone === "rejected" || ret.tone === "canceled"
      ? "canceled"
      : ret.tone === "done"
        ? "delivered"
        : "return"
    : orderState(order)
  return (
    <span className={styles.pill} data-tone={tone}>
      {ret?.label || formatOrderStatusLabel(order)}
    </span>
  )
}

function OrderRow({ order, detail }: { order: OrderView; detail?: string | null }) {
  const thumb = order.items?.[0]?.thumbnail || PRODUCT_IMAGE
  const extra = Math.max(0, (order.items || []).length - 1)
  const summary = itemSummary(order)
  return (
    <li className={styles.row}>
      <Link
        href={`/hesabim/orders/${order.id}`}
        className={styles.rowLink}
        data-testid="account-order-link"
      >
        <span className={styles.rowMedia}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...optimizedImg(thumb, "120px")} alt="" className={styles.rowThumb} loading="lazy" />
          {extra > 0 ? <span className={styles.rowMore}>+{extra}</span> : null}
        </span>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>Sipariş #{orderNumber(order)}</span>
          <span className={styles.rowSub}>
            {formatOrderDate(order.created_at)}
            {summary ? `, ${summary}` : ""}
          </span>
          {detail ? <span className={styles.rowDetail}>{detail}</span> : null}
        </span>
        <span className={styles.rowStatus}>
          <StatusPill order={order} />
        </span>
        <span className={styles.rowTotal}>{formatTry(order.total)}</span>
        <span className={styles.rowChevron}>
          <IconChevron />
        </span>
      </Link>
    </li>
  )
}

function OrderProgress({ order }: { order: OrderView }) {
  const tl = resolveOrderTimeline(order)
  if (orderState(order) === "canceled") {
    return <p className={styles.progressCanceled}>Bu sipariş iptal edildi.</p>
  }
  return (
    <div className={styles.progress}>
      <ol className={styles.progressSteps} aria-label="Sipariş durumu">
        {tl.steps.map((step, i) => (
          <li
            key={step.key}
            className={styles.progressStep}
            style={{ "--step": i } as React.CSSProperties}
            data-state={
              i < tl.currentIndex || step.done
                ? "done"
                : step.current
                  ? "current"
                  : "todo"
            }
            aria-current={step.current ? "step" : undefined}
          >
            <span className={styles.progressDot} />
            <span className={styles.progressLabel}>{ORDER_STATUS_BADGE[step.key]}</span>
          </li>
        ))}
      </ol>
      <p className={styles.progressNow}>{ORDER_STATUS_BADGE[tl.currentKey]}</p>
    </div>
  )
}

function EmptyFrame({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={styles.emptyFrame}>
      <p className={styles.emptyText}>{children}</p>
      {action}
    </div>
  )
}

export function AccountDashboard({
  customer,
  orders,
  addresses: initialAddresses,
  cities,
}: {
  customer: CustomerView
  orders: OrderView[]
  addresses: AddressView[]
  cities: TrCityOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>("dashboard")
  const navRef = useRef<HTMLElement>(null)
  const addresses = initialAddresses
  const {
    items: favoriteItems,
    toggleFavorite,
    hydrated: favoritesHydrated,
    pending: favoritesPending,
  } = useFavorites()
  // Hesap listesi sunucudan gelirken boş liste henüz "favori yok" demek değil.
  const favoritesReady =
    favoritesHydrated && !(favoritesPending && favoriteItems.length === 0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<AddressInput>(emptyAddress())
  const [profileForm, setProfileForm] = useState({
    first_name: customer.first_name || "",
    last_name: customer.last_name || "",
  })
  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    new_password: "",
    new_password_confirm: "",
  })

  useEffect(() => {
    setProfileForm({
      first_name: customer.first_name || "",
      last_name: customer.last_name || "",
    })
  }, [customer.first_name, customer.last_name])

  useEffect(() => {
    function fromHash() {
      const hash = window.location.hash.replace("#", "")
      const match = (Object.keys(TAB_HASH) as Tab[]).find(
        (t) => TAB_HASH[t] === hash
      )
      setTab(match || "dashboard")
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [])

  // Dar ekranda sekmeler yatay kayar; seçili olan görünür kalsın.
  useEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    nav.scrollTo({
      left: active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2,
    })
  }, [tab])

  const fullName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() ||
    null
  const greetingName = customer.first_name?.trim() || null
  const memberSince = formatMemberSince(customer.created_at)

  const navItems: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "dashboard", label: "Genel bakış", icon: <IconDashboard /> },
    { id: "orders", label: "Siparişlerim", icon: <IconOrders /> },
    { id: "returns", label: "İadeler", icon: <IconReturns /> },
    { id: "addresses", label: "Adreslerim", icon: <IconAddresses /> },
    { id: "details", label: "Hesap bilgileri", icon: <IconDetails /> },
    { id: "favorites", label: "Favorilerim", icon: <IconFavorites /> },
  ]

  const activeOrders = useMemo(
    () => orders.filter((o) => orderState(o) === "active"),
    [orders]
  )
  // Genel bakışta takip edilecek sipariş: en yeni devam eden, yoksa en yeni.
  const featuredOrder = activeOrders[0] || orders[0] || null
  const recentOrders = useMemo(
    () => orders.filter((o) => o.id !== featuredOrder?.id).slice(0, 4),
    [orders, featuredOrder]
  )

  const ordersWithReturn = useMemo(
    () =>
      orders.filter((o) => returnStatusOf(o) != null),
    [orders]
  )
  // Backend iadeyi yalnız teslim edilen üründe açar. Açık, tamamlanmış ya da
  // reddedilmiş bir iadesi olan sipariş listede durmaz; iptal edilen iade yeniden açılabilir.
  const returnableOrders = useMemo(
    () =>
      orders.filter((o) => {
        if (orderState(o) !== "delivered") return false
        if (!o.return_status && !o.return_meta) return true
        return o.return_status === "canceled" && !isReturnRejected(o.return_meta)
      }),
    [orders]
  )

  const dashboardLead =
    orders.length === 0
      ? "Henüz siparişin yok. İlk siparişini verdiğinde burada adım adım takip edebilirsin."
      : activeOrders.length > 0
        ? `Devam eden ${activeOrders.length} siparişin var.`
        : "Devam eden siparişin yok."

  function go(next: Tab) {
    setFeedback(null)
    setTab(next)
    const hash = TAB_HASH[next]
    const url = hash ? `#${hash}` : window.location.pathname + window.location.search
    window.history.replaceState(null, "", url)
    // Sitede kaydırma yumuşak; sekme değişimi animasyonsuz ve yalnız gerekince atlar.
    const top = navRef.current?.closest("aside")?.parentElement?.getBoundingClientRect().top
    if (top !== undefined && top < 0) {
      window.scrollTo({ top: window.scrollY + top - 16, behavior: "instant" })
    }
  }

  function resetAddressForm() {
    setForm(emptyAddress())
    setEditingId(null)
    setShowForm(false)
    setFeedback(null)
  }

  function startNewAddress() {
    setForm(emptyAddress())
    setEditingId(null)
    setShowForm(true)
    setFeedback(null)
  }

  function startEdit(address: AddressView) {
    setEditingId(address.id)
    setForm(addressToForm(address))
    setShowForm(true)
    setFeedback(null)
  }

  function onLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  function onSaveAddress(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = editingId
        ? await updateCustomerAddressAction(editingId, form)
        : await createCustomerAddressAction(form)
      if (!result.ok) {
        setFeedback({ scope: "address", kind: "error", text: result.message })
        return
      }
      resetAddressForm()
      router.refresh()
    })
  }

  function onDeleteAddress(id: string) {
    if (!window.confirm("Bu adresi silmek istediğinize emin misiniz?")) return
    setFeedback(null)
    startTransition(async () => {
      const result = await deleteCustomerAddressAction(id)
      if (!result.ok) {
        setFeedback({ scope: "address", kind: "error", text: result.message })
        return
      }
      router.refresh()
    })
  }

  function onSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)
    startTransition(async () => {
      const result = await updateCustomerProfileAction(profileForm)
      if (!result.ok) {
        setFeedback({ scope: "profile", kind: "error", text: result.message })
        return
      }
      setFeedback({
        scope: "profile",
        kind: "success",
        text: result.message || "Profil güncellendi.",
      })
      router.refresh()
    })
  }

  function onChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setFeedback(null)

    if (passwordForm.new_password.length < AUTH_PASSWORD_MIN_LENGTH) {
      setFeedback({
        scope: "password",
        kind: "error",
        text: authPasswordTooShortMessage(),
      })
      return
    }
    if (passwordForm.new_password !== passwordForm.new_password_confirm) {
      setFeedback({ scope: "password", kind: "error", text: "Yeni şifreler eşleşmiyor." })
      return
    }

    startTransition(async () => {
      const result = await changePasswordAction(passwordForm)
      if (!result.ok) {
        setFeedback({ scope: "password", kind: "error", text: result.message })
        return
      }
      setPasswordForm({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      })
      setFeedback({
        scope: "password",
        kind: "success",
        text: result.message || "Şifreniz güncellendi.",
      })
    })
  }

  function feedbackFor(scope: Feedback["scope"]) {
    if (!feedback || feedback.scope !== scope) return null
    return (
      <p
        className={feedback.kind === "error" ? styles.error : styles.success}
        role={feedback.kind === "error" ? "alert" : "status"}
      >
        {feedback.text}
      </p>
    )
  }

  const helpBox = (
    <div className={styles.help}>
      <p className={styles.helpTitle}>Yardım mı gerekiyor?</p>
      <a href={COMPANY.phoneHref} className={styles.helpPhone}>
        {COMPANY.phone}
      </a>
      <p className={styles.helpMeta}>{COMPANY.hours}</p>
      <a href={`mailto:${COMPANY.emailOps}`} className={styles.helpMail}>
        {COMPANY.emailOps}
      </a>
    </div>
  )

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.identity}>
            <span className={styles.identityText}>
              <span className={styles.identityName}>{fullName || "Hesabım"}</span>
              <span className={styles.identityMail}>{customer.email}</span>
            </span>
            <button
              type="button"
              className={styles.identityLogout}
              onClick={onLogout}
              disabled={pending}
            >
              Çıkış yap
            </button>
          </div>

          <nav ref={navRef} className={styles.nav} aria-label="Hesap bölümleri">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`account-tab-${item.id}`}
                className={styles.navBtn}
                aria-current={tab === item.id ? "page" : undefined}
                onClick={() => go(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navLogout}`}
              onClick={onLogout}
              disabled={pending}
            >
              <span className={styles.navIcon}>
                <IconLogout />
              </span>
              Çıkış yap
            </button>
          </nav>

          <div className={styles.sidebarHelp}>{helpBox}</div>
        </aside>

        <div className={styles.content}>
          {tab === "dashboard" ? (
            <section className={styles.view} aria-labelledby="dashboard-heading">
              <header className={styles.viewHead}>
                <h1 id="dashboard-heading" className={styles.viewTitle}>
                  Merhaba{greetingName ? `, ${greetingName}` : ""}
                </h1>
                <p className={styles.viewLead}>{dashboardLead}</p>
              </header>

              <div className={styles.overview}>
                <div className={styles.overviewMain}>
                  <section className={styles.panel} aria-labelledby="featured-heading">
                    <div className={styles.panelHead}>
                      <h2 id="featured-heading" className={styles.panelTitle}>
                        {featuredOrder && orderState(featuredOrder) === "active"
                          ? "Devam eden siparişin"
                          : "Son siparişin"}
                      </h2>
                      {orders.length > 0 ? (
                        <button
                          type="button"
                          className={styles.panelLink}
                          data-testid="account-card-orders"
                          onClick={() => go("orders")}
                        >
                          Tüm siparişler
                        </button>
                      ) : null}
                    </div>

                    {featuredOrder ? (
                      <div className={styles.featured}>
                        <div className={styles.featuredTop}>
                          <div className={styles.featuredId}>
                            <p className={styles.featuredNumber}>
                              Sipariş #{orderNumber(featuredOrder)}
                            </p>
                            <p className={styles.featuredMeta}>
                              {formatOrderDate(featuredOrder.created_at)}
                              {featuredOrder.item_count
                                ? `, ${featuredOrder.item_count} ürün`
                                : ""}
                            </p>
                          </div>
                          <p className={styles.featuredTotal}>
                            {formatTry(featuredOrder.total)}
                          </p>
                        </div>

                        <OrderProgress order={featuredOrder} />

                        {trackingNumber(featuredOrder) ? (
                          <p className={styles.featuredTracking}>
                            Kargo takip no{" "}
                            <span className={styles.featuredTrackingNo}>
                              {trackingNumber(featuredOrder)}
                            </span>
                          </p>
                        ) : null}

                        <div className={styles.featuredFoot}>
                          <ul className={styles.featuredItems}>
                            {(featuredOrder.items || []).slice(0, 4).map((item, i) => (
                              <li key={item.id || i} className={styles.featuredItem}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  {...optimizedImg(item.thumbnail || PRODUCT_IMAGE, "120px")}
                                  alt=""
                                  className={styles.featuredThumb}
                                />
                                <span className={styles.featuredItemText}>
                                  <span className={styles.featuredItemTitle}>
                                    {item.title || "Ürün"}
                                  </span>
                                  <span className={styles.featuredItemQty}>
                                    {item.variant_title
                                      ? `${item.variant_title}, `
                                      : ""}
                                    {item.quantity || 1} adet
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                          <Link
                            href={`/hesabim/orders/${featuredOrder.id}`}
                            className={styles.inkBtn}
                          >
                            Siparişi görüntüle
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <EmptyFrame
                        action={
                          <Link href="/urun-kategori" className={styles.inkBtn}>
                            Alışverişe başla
                          </Link>
                        }
                      >
                        Siparişlerin burada hazırlanmadan teslimata kadar adım adım
                        görünür.
                      </EmptyFrame>
                    )}
                  </section>

                  {recentOrders.length > 0 ? (
                    <section className={styles.panel} aria-labelledby="recent-heading">
                      <div className={styles.panelHead}>
                        <h2 id="recent-heading" className={styles.panelTitle}>
                          Önceki siparişler
                        </h2>
                        {orders.length > recentOrders.length + 1 ? (
                          <button
                            type="button"
                            className={styles.panelLink}
                            onClick={() => go("orders")}
                          >
                            Tümünü gör ({orders.length})
                          </button>
                        ) : null}
                      </div>
                      <ul className={styles.rows}>
                        {recentOrders.map((order) => (
                          <OrderRow key={order.id} order={order} />
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>

                <div className={styles.overviewSide}>
                  <section className={styles.panel} aria-labelledby="ov-address-heading">
                    <div className={styles.panelHead}>
                      <h2 id="ov-address-heading" className={styles.panelTitle}>
                        Teslimat adresi
                      </h2>
                      {addresses.length > 0 ? (
                        <button
                          type="button"
                          className={styles.panelLink}
                          data-testid="account-card-addresses"
                          onClick={() => go("addresses")}
                        >
                          Yönet
                        </button>
                      ) : null}
                    </div>
                    {addresses[0] ? (
                      <address className={styles.addressBlock}>
                        <span className={styles.addressName}>
                          {addresses[0].first_name} {addresses[0].last_name}
                        </span>
                        <span>
                          {addresses[0].metadata?.neighbourhood
                            ? `${addresses[0].metadata.neighbourhood}, `
                            : ""}
                          {addresses[0].address_1}
                        </span>
                        <span>
                          {addresses[0].metadata?.district
                            ? `${addresses[0].metadata.district}, `
                            : ""}
                          {addresses[0].city}
                        </span>
                        {addresses.length > 1 ? (
                          <span className={styles.addressMore}>
                            ve {addresses.length - 1} adres daha
                          </span>
                        ) : null}
                      </address>
                    ) : (
                      <>
                        <p className={styles.panelNote}>
                          Kayıtlı adresin yok. Bir adres eklersen ödemede yeniden
                          yazman gerekmez.
                        </p>
                        <button
                          type="button"
                          className={`${styles.outlineBtn} ${styles.panelAction}`}
                          data-testid="account-card-addresses"
                          onClick={() => {
                            go("addresses")
                            startNewAddress()
                          }}
                        >
                          Adres ekle
                        </button>
                      </>
                    )}
                  </section>

                  <section className={styles.panel} aria-labelledby="ov-details-heading">
                    <div className={styles.panelHead}>
                      <h2 id="ov-details-heading" className={styles.panelTitle}>
                        Hesap bilgileri
                      </h2>
                      <button
                        type="button"
                        className={styles.panelLink}
                        onClick={() => go("details")}
                      >
                        Düzenle
                      </button>
                    </div>
                    <dl className={styles.kv}>
                      <div className={styles.kvRow}>
                        <dt>Ad soyad</dt>
                        <dd>{fullName || "—"}</dd>
                      </div>
                      <div className={styles.kvRow}>
                        <dt>E-posta</dt>
                        <dd>{customer.email || "—"}</dd>
                      </div>
                      {memberSince ? (
                        <div className={styles.kvRow}>
                          <dt>Üyelik</dt>
                          <dd>{memberSince}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </section>

                  <section className={styles.panel} aria-labelledby="ov-links-heading">
                    <h2 id="ov-links-heading" className={styles.panelTitle}>
                      Diğer işlemler
                    </h2>
                    <ul className={styles.links}>
                      {[
                        {
                          id: "returns" as Tab,
                          label: "İade talebi",
                          desc: "Kargolanan siparişte ürün iade et.",
                        },
                        {
                          id: "details" as Tab,
                          label: "Şifre değiştir",
                          desc: "Giriş şifreni güncelle.",
                        },
                      ].map((link) => (
                        <li key={link.id}>
                          <button
                            type="button"
                            className={styles.linkRow}
                            data-testid={`account-card-${link.id}`}
                            onClick={() => go(link.id)}
                          >
                            <span className={styles.linkText}>
                              <span className={styles.linkLabel}>{link.label}</span>
                              <span className={styles.linkDesc}>{link.desc}</span>
                            </span>
                            <IconChevron />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className={styles.panel} aria-labelledby="ov-fav-heading">
                    <div className={styles.panelHead}>
                      <h2 id="ov-fav-heading" className={styles.panelTitle}>
                        Favorilerin
                      </h2>
                      {favoriteItems.length > 0 ? (
                        <button
                          type="button"
                          className={styles.panelLink}
                          data-testid="account-card-favorites"
                          onClick={() => go("favorites")}
                        >
                          Tümü ({favoriteItems.length})
                        </button>
                      ) : null}
                    </div>
                    {favoriteItems.length > 0 ? (
                      <ul className={styles.favMini}>
                        {favoriteItems.slice(0, 3).map((item) => (
                          <li key={item.id}>
                            <Link
                              href={productPath(item.handle)}
                              className={styles.favMiniLink}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                {...optimizedImg(item.image || PRODUCT_IMAGE, "120px")}
                                alt=""
                                className={styles.favMiniThumb}
                              />
                              <span className={styles.favMiniTitle}>{item.title}</span>
                              <span className={styles.favMiniPrice}>
                                {formatTry(item.price)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : !favoritesReady ? null : (
                      <p className={styles.panelNote}>
                        Beğendiğin çayları ürün kartındaki kalple kaydet, burada
                        dursun.
                      </p>
                    )}
                  </section>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "orders" ? (
            <section className={styles.view} aria-labelledby="orders-heading">
              <header className={styles.viewHead}>
                <h1 id="orders-heading" className={styles.viewTitle}>
                  Siparişlerim
                </h1>
                <p className={styles.viewLead}>
                  {orders.length > 0
                    ? `${orders.length} sipariş, en yenisi üstte.`
                    : "Verdiğin siparişler burada listelenir."}
                </p>
              </header>
              {orders.length === 0 ? (
                <div data-testid="account-orders-empty">
                  <EmptyFrame
                    action={
                      <Link href="/urun-kategori" className={styles.inkBtn}>
                        Alışverişe başla
                      </Link>
                    }
                  >
                    Henüz siparişin yok.
                  </EmptyFrame>
                </div>
              ) : (
                <div className={styles.panelFlush}>
                  <div className={styles.rowsHead} aria-hidden>
                    <span>Sipariş</span>
                    <span>Durum</span>
                    <span className={styles.rowsHeadNum}>Tutar</span>
                  </div>
                  <ul className={styles.rows} data-testid="account-orders-list">
                    {orders.map((order) => (
                      <OrderRow key={order.id} order={order} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ) : null}

          {tab === "returns" ? (
            <section
              className={styles.view}
              aria-labelledby="returns-heading"
              data-testid="account-returns"
            >
              <header className={styles.viewHead}>
                <h1 id="returns-heading" className={styles.viewTitle}>
                  İadeler
                </h1>
                <p className={styles.viewLead}>
                  Teslim edilen siparişlerde iade ya da değişim talebi açabilirsin.
                  Siparişi aç, iade etmek istediğin ürünleri seç.
                </p>
              </header>

              <section className={styles.panel} aria-labelledby="return-requests-heading">
                <div className={styles.panelHead}>
                  <h2 id="return-requests-heading" className={styles.panelTitle}>
                    İade taleplerin
                  </h2>
                </div>
                {ordersWithReturn.length > 0 ? (
                  <ul className={styles.rows} data-testid="account-returns-list">
                    {ordersWithReturn.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        detail={returnStatusOf(order)?.note}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className={styles.panelNote}>Açık ya da geçmiş bir iade talebin yok.</p>
                )}
              </section>

              <section className={styles.panel} aria-labelledby="returnable-heading">
                <div className={styles.panelHead}>
                  <h2 id="returnable-heading" className={styles.panelTitle}>
                    İade başlatılabilecek siparişler
                  </h2>
                </div>
                {returnableOrders.length > 0 ? (
                  <ul className={styles.rows}>
                    {returnableOrders.map((order) => (
                      <OrderRow key={`ret-${order.id}`} order={order} />
                    ))}
                  </ul>
                ) : (
                  <p className={styles.panelNote}>
                    {orders.length === 0
                      ? "İade için önce bir siparişin olmalı."
                      : "İade açılabilecek bir siparişin yok. Siparişin teslim edilince burada görünür."}
                  </p>
                )}
              </section>
            </section>
          ) : null}

          {tab === "addresses" ? (
            <section className={styles.view} aria-labelledby="addresses-heading">
              <header className={styles.viewHeadRow}>
                <div className={styles.viewHead}>
                  <h1 id="addresses-heading" className={styles.viewTitle}>
                    Adreslerim
                  </h1>
                  <p className={styles.viewLead}>
                    {addresses.length > 0
                      ? `${addresses.length} kayıtlı teslimat adresi. Ödemede bunlardan birini seçebilirsin.`
                      : "Kayıtlı adresler ödemede hazır gelir."}
                  </p>
                </div>
                {!showForm ? (
                  <button type="button" className={styles.inkBtn} onClick={startNewAddress}>
                    Yeni adres ekle
                  </button>
                ) : null}
              </header>

              {!showForm ? feedbackFor("address") : null}

              {showForm ? (
                <form className={styles.panel} onSubmit={onSaveAddress}>
                  <div className={styles.panelHead}>
                    <h2 className={styles.panelTitle}>
                      {editingId ? "Adresi düzenle" : "Yeni adres"}
                    </h2>
                  </div>
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-first">
                        Ad
                      </label>
                      <input
                        id="addr-first"
                        className={styles.input}
                        autoComplete="given-name"
                        value={form.first_name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, first_name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-last">
                        Soyad
                      </label>
                      <input
                        id="addr-last"
                        className={styles.input}
                        autoComplete="family-name"
                        value={form.last_name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, last_name: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-city">
                        İl
                      </label>
                      <select
                        id="addr-city"
                        className={styles.select}
                        value={form.city}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            city: e.target.value,
                            district: "",
                            neighbourhood: "",
                          }))
                        }
                        required
                      >
                        <option value="">İl seçin</option>
                        {cities.map((c) => (
                          <option key={c.code} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-district">
                        İlçe
                      </label>
                      <select
                        id="addr-district"
                        className={styles.select}
                        value={form.district}
                        disabled={!form.city}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            district: e.target.value,
                            neighbourhood: "",
                          }))
                        }
                        required
                      >
                        <option value="">
                          {form.city ? "İlçe seçin" : "Önce il seçin"}
                        </option>
                        {districtsFor(form.city).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={`${styles.field} ${styles.fieldWide}`}>
                      <label className={styles.label} htmlFor="addr-neighbourhood">
                        Mahalle
                      </label>
                      <NeighbourhoodSelect
                        id="addr-neighbourhood"
                        city={form.city}
                        district={form.district}
                        value={form.neighbourhood}
                        onChange={(neighbourhood) =>
                          setForm((f) => ({ ...f, neighbourhood }))
                        }
                        className={styles.select}
                        inputClassName={styles.input}
                      />
                    </div>
                    <div className={`${styles.field} ${styles.fieldWide}`}>
                      <label className={styles.label} htmlFor="addr-line">
                        Adres
                      </label>
                      <input
                        id="addr-line"
                        className={styles.input}
                        placeholder="Cadde, sokak, bina no, daire"
                        autoComplete="address-line1"
                        value={form.address_1}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, address_1: e.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-postal">
                        Posta kodu
                      </label>
                      <input
                        id="addr-postal"
                        className={styles.input}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        maxLength={5}
                        value={form.postal_code}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            postal_code: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-phone">
                        Telefon
                      </label>
                      <input
                        id="addr-phone"
                        className={styles.input}
                        type="tel"
                        autoComplete="tel"
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  {feedbackFor("address")}

                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.outlineBtn}
                      onClick={resetAddressForm}
                      disabled={pending}
                    >
                      Vazgeç
                    </button>
                    <button type="submit" className={styles.inkBtn} disabled={pending}>
                      {pending ? "Kaydediliyor…" : "Adresi kaydet"}
                    </button>
                  </div>
                </form>
              ) : null}

              {addresses.length > 0 ? (
                <ul className={styles.addressGrid}>
                  {addresses.map((address) => (
                    <li key={address.id} className={styles.addressCard}>
                      <address className={styles.addressBlock}>
                        <span className={styles.addressName}>
                          {address.first_name} {address.last_name}
                        </span>
                        <span>
                          {address.metadata?.neighbourhood || address.address_2
                            ? `${address.metadata?.neighbourhood || address.address_2}, `
                            : ""}
                          {address.address_1}
                        </span>
                        <span>
                          {address.metadata?.district
                            ? `${address.metadata.district}, `
                            : ""}
                          {address.city} {address.postal_code}
                        </span>
                        <span className={styles.addressPhone}>{formatPhone(address.phone)}</span>
                      </address>
                      <div className={styles.addressActions}>
                        <button
                          type="button"
                          className={styles.textBtn}
                          onClick={() => startEdit(address)}
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          className={styles.textBtnDanger}
                          onClick={() => onDeleteAddress(address.id)}
                          disabled={pending}
                        >
                          Sil
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : !showForm ? (
                <EmptyFrame>Kayıtlı adresin yok.</EmptyFrame>
              ) : null}
            </section>
          ) : null}

          {tab === "details" ? (
            <section className={styles.view} aria-labelledby="details-heading">
              <header className={styles.viewHead}>
                <h1 id="details-heading" className={styles.viewTitle}>
                  Hesap bilgileri
                </h1>
                <p className={styles.viewLead}>
                  {memberSince
                    ? `${memberSince} tarihinden beri Es Çay üyesisin.`
                    : "Ad, soyad ve şifreni buradan güncelleyebilirsin."}
                </p>
              </header>

              <div className={styles.settingsRow}>
                <div className={styles.settingsLabel}>
                  <h2 className={styles.panelTitle}>Kişisel bilgiler</h2>
                  <p className={styles.settingsDesc}>
                    Siparişlerde ve faturalarda görünen adın.
                  </p>
                </div>
                <form className={styles.panel} onSubmit={onSaveProfile}>
                  <div className={styles.formGrid}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="profile-first">
                        Ad
                      </label>
                      <input
                        id="profile-first"
                        className={styles.input}
                        value={profileForm.first_name}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            first_name: e.target.value,
                          }))
                        }
                        autoComplete="given-name"
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="profile-last">
                        Soyad
                      </label>
                      <input
                        id="profile-last"
                        className={styles.input}
                        value={profileForm.last_name}
                        onChange={(e) =>
                          setProfileForm((f) => ({
                            ...f,
                            last_name: e.target.value,
                          }))
                        }
                        autoComplete="family-name"
                      />
                    </div>
                    <div className={`${styles.field} ${styles.fieldWide}`}>
                      <label className={styles.label} htmlFor="profile-email">
                        E-posta
                      </label>
                      <input
                        id="profile-email"
                        className={styles.input}
                        value={customer.email || ""}
                        disabled
                        readOnly
                      />
                      <p className={styles.hint}>
                        E-posta adresi giriş için kullanılır ve değiştirilemez.
                      </p>
                    </div>
                  </div>
                  {feedbackFor("profile")}
                  <div className={styles.formActions}>
                    <button type="submit" className={styles.inkBtn} disabled={pending}>
                      {pending ? "Kaydediliyor…" : "Bilgileri kaydet"}
                    </button>
                  </div>
                </form>
              </div>

              <div className={styles.settingsRow}>
                <div className={styles.settingsLabel}>
                  <h2 className={styles.panelTitle}>Şifre</h2>
                  <p className={styles.settingsDesc}>
                    Yeni şifren en az {AUTH_PASSWORD_MIN_LENGTH} karakter olmalı.
                  </p>
                </div>
                <form className={styles.panel} onSubmit={onChangePassword}>
                  <div className={styles.formGrid}>
                    <div className={`${styles.field} ${styles.fieldWide}`}>
                      <label className={styles.label} htmlFor="pw-current">
                        Mevcut şifre
                      </label>
                      <input
                        id="pw-current"
                        type="password"
                        className={styles.input}
                        autoComplete="current-password"
                        value={passwordForm.current_password}
                        onChange={(e) =>
                          setPasswordForm((f) => ({
                            ...f,
                            current_password: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="pw-new">
                        Yeni şifre
                      </label>
                      <input
                        id="pw-new"
                        type="password"
                        className={styles.input}
                        autoComplete="new-password"
                        minLength={AUTH_PASSWORD_MIN_LENGTH}
                        value={passwordForm.new_password}
                        onChange={(e) =>
                          setPasswordForm((f) => ({
                            ...f,
                            new_password: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="pw-confirm">
                        Yeni şifre (tekrar)
                      </label>
                      <input
                        id="pw-confirm"
                        type="password"
                        className={styles.input}
                        autoComplete="new-password"
                        minLength={AUTH_PASSWORD_MIN_LENGTH}
                        value={passwordForm.new_password_confirm}
                        onChange={(e) =>
                          setPasswordForm((f) => ({
                            ...f,
                            new_password_confirm: e.target.value,
                          }))
                        }
                        required
                      />
                    </div>
                  </div>
                  {feedbackFor("password")}
                  <div className={styles.formActions}>
                    <button type="submit" className={styles.inkBtn} disabled={pending}>
                      {pending ? "Güncelleniyor…" : "Şifreyi güncelle"}
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          {tab === "favorites" ? (
            <section className={styles.view} aria-labelledby="favorites-heading">
              <header className={styles.viewHead}>
                <h1 id="favorites-heading" className={styles.viewTitle}>
                  Favorilerim
                </h1>
                <p className={styles.viewLead}>
                  {!favoritesReady
                    ? "Favorilerin yükleniyor…"
                    : favoriteItems.length > 0
                      ? `${favoriteItems.length} ürün kayıtlı.`
                      : "Beğendiğin ürünleri kalple kaydet, burada dursun."}
                </p>
              </header>
              {!favoritesReady ? null : favoriteItems.length === 0 ? (
                <EmptyFrame
                  action={
                    <Link href="/urun-kategori" className={styles.inkBtn}>
                      Ürünlere göz at
                    </Link>
                  }
                >
                  Henüz favori ürünün yok.
                </EmptyFrame>
              ) : (
                <ul className={styles.favGrid}>
                  {favoriteItems.map((item) => (
                    <li key={item.id} className={styles.favCard}>
                      <Link href={productPath(item.handle)} className={styles.favLink}>
                        <span className={styles.favMedia}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            {...optimizedImg(item.image || PRODUCT_IMAGE, "120px")}
                            alt=""
                            className={styles.favThumb}
                          />
                        </span>
                        <span className={styles.favTitle}>{item.title}</span>
                        <span className={styles.favPrice}>{formatTry(item.price)}</span>
                      </Link>
                      <button
                        type="button"
                        className={styles.textBtn}
                        onClick={() => toggleFavorite(item)}
                      >
                        Favorilerden çıkar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <div className={styles.contentHelp}>{helpBox}</div>
        </div>
      </div>
    </div>
  )
}
