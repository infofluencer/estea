"use client"

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react"
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
import { trCityCodeForName } from "@escay/shared/tr-address"
import { useFavorites } from "@/components/FavoritesProvider"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"
import { resolveOrderNumberLabel } from "@escay/shared/order-number"
import { formatOrderStatusLabel } from "@escay/shared/order-timeline"
import styles from "./account.module.css"
import { productPath } from "@/lib/urls"

type CustomerView = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
}

type OrderView = {
  id: string
  display_id?: number | null
  created_at?: string | null
  total?: number | null
  status?: string | null
  return_status?: string | null
  return_meta?: {
    rejected?: boolean
    escay_rejection?: { rejected?: boolean } | null
    paytr_refund?: { status?: string | null } | null
  } | null
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

function formatStatus(order: {
  status?: string | null
  fulfillments?: {
    shipped_at?: string | null
    delivered_at?: string | null
    labels?: { tracking_number?: string | null }[] | null
  }[]
  payment_collections?: { status?: string | null }[] | null
}) {
  return formatOrderStatusLabel(order)
}

function formatReturnStatus(
  status?: string | null,
  meta?: {
    rejected?: boolean
    escay_rejection?: { rejected?: boolean } | null
    paytr_refund?: { status?: string | null } | null
  } | null
) {
  if (!status && !meta) return null
  if (meta?.escay_rejection?.rejected === true || meta?.rejected === true) {
    return "İade reddedildi"
  }
  if (meta?.paytr_refund?.status === "success") {
    return "Para iade edildi"
  }
  if (!status) return null
  const map: Record<string, string> = {
    open: "İade açık",
    requested: "İade talebi",
    received: "İade alındı",
    partially_received: "İade kısmen alındı",
    canceled: "İade iptal",
  }
  return map[status] || `İade: ${status}`
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
    phone: a.phone || "",
    country_code: "tr",
  }
}

function IconDashboard({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3.5" y="3.5" width="7.5" height="7.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="3.5" width="7.5" height="4.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function IconOrders({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 7h13l-1.4 8.2a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.6L5.5 3H3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="20" r="1.2" fill="currentColor" />
      <circle cx="17.5" cy="20" r="1.2" fill="currentColor" />
    </svg>
  )
}

function IconAddresses({ size = 28 }: { size?: number }) {
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

function IconDetails({ size = 28 }: { size?: number }) {
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

function IconLogout({ size = 28 }: { size?: number }) {
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

function IconFavorites({ size = 28 }: { size?: number }) {
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

function IconReturns({ size = 28 }: { size?: number }) {
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
  const addresses = initialAddresses
  const { items: favoriteItems, toggleFavorite } = useFavorites()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
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

  const greetingName = customer.first_name?.trim() || null

  const navItems: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "dashboard", label: "Pano", icon: <IconDashboard size={18} /> },
    { id: "orders", label: "Siparişler", icon: <IconOrders size={18} /> },
    { id: "returns", label: "İadeler", icon: <IconReturns size={18} /> },
    { id: "addresses", label: "Adresler", icon: <IconAddresses size={18} /> },
    { id: "details", label: "Hesap Detayları", icon: <IconDetails size={18} /> },
    { id: "favorites", label: "Favori Listesi", icon: <IconFavorites size={18} /> },
  ]

  const dashboardCards: {
    id: Tab
    title: string
    description: string
    icon: ReactNode
  }[] = [
    {
      id: "orders",
      title: "Siparişler",
      description: "Siparişlerini takip et, geçmiş siparişlerini gör.",
      icon: <IconOrders />,
    },
    {
      id: "returns",
      title: "İadeler",
      description: "İade taleplerini görüntüle veya yeni talep oluştur.",
      icon: <IconReturns />,
    },
    {
      id: "addresses",
      title: "Adresler",
      description: "Teslimat adreslerini ekle, düzenle veya sil.",
      icon: <IconAddresses />,
    },
    {
      id: "details",
      title: "Hesap Detayları",
      description: "Profil bilgilerini ve şifreni güncelle.",
      icon: <IconDetails />,
    },
    {
      id: "favorites",
      title: "Favori Listesi",
      description: "Beğendiğin ürünleri görüntüle ve yönet.",
      icon: <IconFavorites />,
    },
  ]

  const ordersWithReturn = useMemo(
    () =>
      orders.filter(
        (o) => formatReturnStatus(o.return_status, o.return_meta) != null
      ),
    [orders]
  )

  function go(next: Tab) {
    setError(null)
    setInfo(null)
    setTab(next)
  }

  function resetAddressForm() {
    setForm(emptyAddress())
    setEditingId(null)
    setShowForm(false)
    setError(null)
  }

  function startEdit(address: AddressView) {
    setEditingId(address.id)
    setForm(addressToForm(address))
    setShowForm(true)
    setError(null)
  }

  function onLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  function onSaveAddress(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = editingId
        ? await updateCustomerAddressAction(editingId, form)
        : await createCustomerAddressAction(form)
      if (!result.ok) {
        setError(result.message)
        return
      }
      resetAddressForm()
      router.refresh()
    })
  }

  function onDeleteAddress(id: string) {
    if (!window.confirm("Bu adresi silmek istediğinize emin misiniz?")) return
    setError(null)
    startTransition(async () => {
      const result = await deleteCustomerAddressAction(id)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.refresh()
    })
  }

  function onSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const result = await updateCustomerProfileAction(profileForm)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setInfo(result.message || "Profil güncellendi.")
      router.refresh()
    })
  }

  function onChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    if (passwordForm.new_password.length < AUTH_PASSWORD_MIN_LENGTH) {
      setError(authPasswordTooShortMessage())
      return
    }
    if (passwordForm.new_password !== passwordForm.new_password_confirm) {
      setError("Yeni şifreler eşleşmiyor.")
      return
    }

    startTransition(async () => {
      const result = await changePasswordAction(passwordForm)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setPasswordForm({
        current_password: "",
        new_password: "",
        new_password_confirm: "",
      })
      setInfo(result.message || "Şifreniz güncellendi.")
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <h1 className={styles.title}>Hesabım</h1>
          <nav className={styles.nav} aria-label="Hesap bölümleri">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`account-tab-${item.id}`}
                className={tab === item.id ? styles.navBtnActive : styles.navBtn}
                onClick={() => go(item.id)}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            ))}
            <button
              type="button"
              className={`${styles.navBtn} ${styles.logout}`}
              onClick={onLogout}
              disabled={pending}
            >
              <span className={styles.navIcon}>
                <IconLogout size={18} />
              </span>
              Çıkış Yap
            </button>
          </nav>
        </aside>

        <div className={styles.content}>
          <div className={styles.mobileBar}>
            {tab !== "dashboard" ? (
              <button
                type="button"
                className={styles.mobileBack}
                onClick={() => go("dashboard")}
              >
                ← Hesabıma dön
              </button>
            ) : null}
            <h1 className={styles.title}>Hesabım</h1>
          </div>

          {tab === "dashboard" ? (
            <section
              className={styles.section}
              aria-labelledby="dashboard-heading"
            >
              <div className={styles.welcome}>
                <h2 id="dashboard-heading" className={styles.welcomeTitle}>
                  Merhaba{greetingName ? `, ${greetingName}` : ""}
                </h2>
                <p className={styles.welcomeLead}>
                  Hesap panondan siparişlerini ve iadelerini görüntüleyebilir,
                  adreslerini yönetebilir, hesap bilgilerini düzenleyebilirsin.
                </p>
              </div>

              {addresses.length === 0 ? (
                <p className={styles.notice} role="status">
                  Henüz kayıtlı teslimat adresin yok.{" "}
                  <button
                    type="button"
                    className={styles.noticeAction}
                    onClick={() => go("addresses")}
                  >
                    Adres ekle
                  </button>
                </p>
              ) : null}

              <div className={styles.cardGrid}>
                {dashboardCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={styles.dashCard}
                    data-testid={`account-card-${card.id}`}
                    onClick={() => go(card.id)}
                  >
                    <span className={styles.dashCardIcon}>{card.icon}</span>
                    <span className={styles.dashCardTitle}>{card.title}</span>
                    <span className={styles.dashCardDesc}>
                      {card.description}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={styles.mobileLogout}
                onClick={onLogout}
                disabled={pending}
              >
                <IconLogout size={18} />
                Çıkış Yap
              </button>
            </section>
          ) : null}

          {tab === "orders" ? (
            <section className={styles.section} aria-labelledby="orders-heading">
              <h2 id="orders-heading" className={styles.sectionTitle}>
                Siparişler
              </h2>
              {orders.length === 0 ? (
                <div className={styles.emptyBlock} data-testid="account-orders-empty">
                  <p className={styles.empty}>
                    Henüz siparişin yok.
                  </p>
                  <Link href="/urun-kategori" className={styles.emptyLink}>
                    Alışverişe başla
                  </Link>
                </div>
              ) : (
                <ul className={styles.orderList} data-testid="account-orders-list">
                  {orders.map((order) => {
                    const returnLabel = formatReturnStatus(
                      order.return_status,
                      order.return_meta
                    )
                    const previews = (order.items || []).slice(0, 4)
                    const extraCount = Math.max(
                      0,
                      (order.items || []).length - previews.length
                    )
                    return (
                      <li key={order.id} className={styles.orderItem}>
                        <Link
                          href={`/hesabim/orders/${order.id}`}
                          className={styles.orderCard}
                          data-testid="account-order-link"
                        >
                          <div className={styles.orderThumbs}>
                            {previews.length === 0 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={PRODUCT_IMAGE}
                                alt=""
                                className={styles.orderThumb}
                              />
                            ) : (
                              previews.map((item, i) => (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  key={item.id || `${order.id}-${i}`}
                                  src={item.thumbnail || PRODUCT_IMAGE}
                                  alt=""
                                  className={styles.orderThumb}
                                />
                              ))
                            )}
                            {extraCount > 0 ? (
                              <span className={styles.orderThumbMore}>
                                +{extraCount}
                              </span>
                            ) : null}
                          </div>
                          <div className={styles.orderCardBody}>
                            <div className={styles.orderCardTop}>
                              <span className={styles.orderCardTitle}>
                                Sipariş #
                                {resolveOrderNumberLabel({
                                  id: order.id,
                                  display_id: order.display_id,
                                })}
                              </span>
                              <span className={styles.orderCardTotal}>
                                {formatTry(order.total)}
                              </span>
                            </div>
                            <div className={styles.orderCardMeta}>
                              <span>{formatOrderDate(order.created_at)}</span>
                              <span className={styles.statusPill}>
                                {formatStatus(order)}
                              </span>
                              {returnLabel ? (
                                <span className={styles.returnBadge}>
                                  {returnLabel}
                                </span>
                              ) : null}
                            </div>
                            {(order.items || []).length > 0 ? (
                              <p className={styles.orderCardItems}>
                                {(order.items || [])
                                  .slice(0, 2)
                                  .map((it) => it.title || "Ürün")
                                  .join(" · ")}
                                {(order.items || []).length > 2
                                  ? ` · +${(order.items || []).length - 2}`
                                  : ""}
                                {order.item_count
                                  ? ` · ${order.item_count} adet`
                                  : ""}
                              </p>
                            ) : null}
                            <span className={styles.orderCardCta}>Detayı gör →</span>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "returns" ? (
            <section
              className={styles.section}
              aria-labelledby="returns-heading"
              data-testid="account-returns"
            >
              <h2 id="returns-heading" className={styles.sectionTitle}>
                İadeler
              </h2>
              <p className={styles.welcomeLead} style={{ marginTop: 0 }}>
                İade talebi oluşturmak için sipariş detayına git. Ürün
                kargolandıktan sonra iade edilebilir hale gelir.
              </p>

              {ordersWithReturn.length > 0 ? (
                <>
                  <h3 className={styles.subSectionTitle}>Aktif / geçmiş talepler</h3>
                  <ul className={styles.orderList} data-testid="account-returns-list">
                    {ordersWithReturn.map((order) => {
                      const returnLabel = formatReturnStatus(
                        order.return_status,
                        order.return_meta
                      )
                      const thumb = order.items?.[0]?.thumbnail || PRODUCT_IMAGE
                      return (
                        <li key={order.id} className={styles.orderItem}>
                          <Link
                            href={`/hesabim/orders/${order.id}`}
                            className={styles.orderCard}
                          >
                            <div className={styles.orderThumbs}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={thumb}
                                alt=""
                                className={styles.orderThumb}
                              />
                            </div>
                            <div className={styles.orderCardBody}>
                              <div className={styles.orderCardTop}>
                                <span className={styles.orderCardTitle}>
                                  Sipariş #
                                  {resolveOrderNumberLabel({
                                    id: order.id,
                                    display_id: order.display_id,
                                  })}
                                </span>
                                <span className={styles.orderCardTotal}>
                                  {formatTry(order.total)}
                                </span>
                              </div>
                              <div className={styles.orderCardMeta}>
                                <span>{formatOrderDate(order.created_at)}</span>
                                {returnLabel ? (
                                  <span className={styles.returnBadge}>
                                    {returnLabel}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : null}

              <h3 className={styles.subSectionTitle}>
                {ordersWithReturn.length > 0
                  ? "Siparişlerden iade oluştur"
                  : "Siparişlerin"}
              </h3>
              {orders.length === 0 ? (
                <div className={styles.emptyBlock}>
                  <p className={styles.empty}>
                    İade için önce bir siparişin olmalı.
                  </p>
                  <Link href="/urun-kategori" className={styles.emptyLink}>
                    Alışverişe başla
                  </Link>
                </div>
              ) : (
                <ul className={styles.orderList}>
                  {orders.map((order) => {
                    const thumb = order.items?.[0]?.thumbnail || PRODUCT_IMAGE
                    return (
                      <li key={`ret-${order.id}`} className={styles.orderItem}>
                        <Link
                          href={`/hesabim/orders/${order.id}`}
                          className={styles.orderCard}
                        >
                          <div className={styles.orderThumbs}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={thumb}
                              alt=""
                              className={styles.orderThumb}
                            />
                          </div>
                          <div className={styles.orderCardBody}>
                            <div className={styles.orderCardTop}>
                              <span className={styles.orderCardTitle}>
                                Sipariş #
                                {resolveOrderNumberLabel({
                                  id: order.id,
                                  display_id: order.display_id,
                                })}
                              </span>
                              <span className={styles.orderCardTotal}>
                                {formatTry(order.total)}
                              </span>
                            </div>
                            <div className={styles.orderCardMeta}>
                              <span>{formatOrderDate(order.created_at)}</span>
                              <span className={styles.orderCardCta}>
                                İade / detay →
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {tab === "addresses" ? (
            <section
              className={styles.section}
              aria-labelledby="addresses-heading"
            >
              <h2 id="addresses-heading" className={styles.sectionTitle}>
                Adresler
              </h2>

              {error ? <p className={styles.error}>{error}</p> : null}

              <div className={styles.addressList}>
                {addresses.length === 0 && !showForm ? (
                  <p className={styles.empty}>Kayıtlı adres yok.</p>
                ) : null}
                {addresses.map((address) => (
                  <div key={address.id} className={styles.addressCard}>
                    <div className={styles.addressCardHead}>
                      <p className={styles.addressName}>
                        {address.first_name} {address.last_name}
                      </p>
                      <span className={styles.addressTag}>Teslimat</span>
                    </div>
                    <p className={styles.addressLines}>
                      {address.metadata?.neighbourhood || address.address_2
                        ? `${address.metadata?.neighbourhood || address.address_2}, `
                        : ""}
                      {address.address_1}
                      <br />
                      {address.metadata?.district
                        ? `${address.metadata.district}, `
                        : ""}
                      {address.city} {address.postal_code}
                      <br />
                      {address.phone}
                    </p>
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
                  </div>
                ))}
              </div>

              {!showForm ? (
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setShowForm(true)
                    setForm(emptyAddress())
                    setEditingId(null)
                    setError(null)
                  }}
                >
                  Yeni adres ekle
                </button>
              ) : (
                <form className={styles.form} onSubmit={onSaveAddress}>
                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-first">
                        Ad
                      </label>
                      <input
                        id="addr-first"
                        className={styles.input}
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
                        value={form.last_name}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, last_name: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.row2}>
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
                  </div>

                  <div className={styles.field}>
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

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="addr-line">
                      Adres
                    </label>
                    <input
                      id="addr-line"
                      className={styles.input}
                      placeholder="Cadde, sokak, bina no, daire"
                      value={form.address_1}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, address_1: e.target.value }))
                      }
                      required
                    />
                  </div>

                  <div className={styles.row2}>
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="addr-postal">
                        Posta kodu
                      </label>
                      <input
                        id="addr-postal"
                        className={styles.input}
                        inputMode="numeric"
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
                        value={form.phone}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, phone: e.target.value }))
                        }
                        required
                      />
                    </div>
                  </div>

                  <div className={styles.formActions}>
                    <button
                      type="submit"
                      className={styles.submit}
                      disabled={pending}
                    >
                      {pending ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={resetAddressForm}
                      disabled={pending}
                    >
                      İptal
                    </button>
                  </div>
                </form>
              )}
            </section>
          ) : null}

          {tab === "details" ? (
            <section
              className={styles.section}
              aria-labelledby="details-heading"
            >
              <h2 id="details-heading" className={styles.sectionTitle}>
                Hesap Detayları
              </h2>

              {error ? <p className={styles.error}>{error}</p> : null}
              {info ? <p className={styles.success}>{info}</p> : null}

              <form className={styles.form} onSubmit={onSaveProfile}>
                <div className={styles.row2}>
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
                </div>

                <div className={styles.field}>
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
                  <p className={styles.hint}>E-posta adresi değiştirilemez.</p>
                </div>

                <button
                  type="submit"
                  className={styles.submit}
                  disabled={pending}
                >
                  {pending ? "Kaydediliyor…" : "Profili kaydet"}
                </button>
              </form>

              <div className={styles.subSection}>
                <h3 className={styles.subSectionTitle}>Şifre değiştir</h3>
                <form className={styles.form} onSubmit={onChangePassword}>
                  <div className={styles.field}>
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
                  <button
                    type="submit"
                    className={styles.submit}
                    disabled={pending}
                  >
                    {pending ? "Güncelleniyor…" : "Şifreyi güncelle"}
                  </button>
                </form>
              </div>
            </section>
          ) : null}

          {tab === "favorites" ? (
            <section
              className={styles.section}
              aria-labelledby="favorites-heading"
            >
              <h2 id="favorites-heading" className={styles.sectionTitle}>
                Favori Listesi
              </h2>
              {favoriteItems.length === 0 ? (
                <div className={styles.emptyBlock}>
                  <p className={styles.empty}>Henüz favori ürünün yok.</p>
                  <Link href="/" className={styles.emptyLink}>
                    Ürünlere göz at
                  </Link>
                </div>
              ) : (
                <ul className={styles.favList}>
                  {favoriteItems.map((item) => (
                    <li key={item.id} className={styles.favItem}>
                      <Link
                        href={`${productPath(item.handle)}`}
                        className={styles.favLink}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.image || PRODUCT_IMAGE}
                          alt=""
                          className={styles.favThumb}
                        />
                        <span className={styles.favMeta}>
                          <span className={styles.favTitle}>{item.title}</span>
                          <span className={styles.favPrice}>
                            {formatTry(item.price)}
                          </span>
                        </span>
                      </Link>
                      <button
                        type="button"
                        className={styles.textBtnDanger}
                        onClick={() => toggleFavorite(item)}
                      >
                        Çıkar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/istek-listesi" className={styles.secondaryBtn}>
                Favoriler sayfasını aç
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
