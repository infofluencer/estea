import Link from "next/link"
import type { ReactNode } from "react"
import { includedVatFromGross, roundMoney } from "@/lib/cart-pricing"
import { formatTry } from "@/lib/medusa"
import { resolveOrderNumberLabel } from "@escay/shared/order-number"
import {
  ORDER_STATUS_BADGE,
  resolveOrderTimeline,
  type OrderTimelineStepKey,
} from "@escay/shared/order-timeline"
import type { OrderDetailView } from "@/components/order/order-types"
import { BankTransferBox } from "./BankTransferBox"
import styles from "./checkout-confirmation.module.css"
import { productPath } from "@/lib/urls"

function formatOrderDate(value?: string | Date | null) {
  if (!value) return null
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value))
  } catch {
    return null
  }
}

function productSubtotal(order: OrderDetailView): number {
  const discount = Math.max(0, Number(order.discount_total) || 0)
  if (
    order.original_item_total != null &&
    Number.isFinite(Number(order.original_item_total))
  ) {
    return roundMoney(Number(order.original_item_total))
  }
  if (discount > 0 && order.item_total != null) {
    return roundMoney(Number(order.item_total) + discount)
  }
  return roundMoney(
    Number(order.item_subtotal ?? order.item_total ?? 0) || 0
  )
}

const STATUS_CLASS: Record<OrderTimelineStepKey | "canceled", string> = {
  canceled: styles.status_canceled,
  delivered: styles.status_delivered,
  shipped: styles.status_shipped,
  prepared: styles.status_preparing,
  preparing: styles.status_preparing,
  received: styles.status_pending,
}

export function CheckoutConfirmationView({
  order,
  actions,
}: {
  order: OrderDetailView
  actions?: ReactNode
}) {
  const displayNo = resolveOrderNumberLabel(order)
  const timeline = resolveOrderTimeline(order)
  const statusKey = timeline.canceled
    ? ("canceled" as const)
    : timeline.currentKey
  const statusLabel = timeline.canceled
    ? "İptal"
    : order.bank_transfer
      ? "Ödeme bekleniyor"
      : ORDER_STATUS_BADGE[timeline.currentKey]
  const dateLabel = formatOrderDate(order.created_at)

  const subtotal = productSubtotal(order)
  const discount = Math.max(0, Number(order.discount_total) || 0)
  const shipping = Number(order.shipping_total) || 0
  const total = Number(order.total) || 0
  const includedVat = includedVatFromGross(Math.max(0, subtotal - discount))

  const methods = order.shipping_methods || []
  const address = order.shipping_address
  const items = order.items || []
  const itemCount = items.reduce((n, i) => n + (i.quantity ?? 1), 0)

  return (
    <article className={styles.wrap} data-testid="checkout-confirmation">
      <header className={styles.head}>
        <span className={styles.check} aria-hidden>
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path
              className={styles.checkPath}
              pathLength={1}
              d="M5 12.5l4.2 4.2L19 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h1 className={styles.title}>
          {order.bank_transfer ? "Siparişiniz oluşturuldu" : "Siparişiniz alındı"}
        </h1>
        <p className={styles.meta}>
          <span
            className={styles.orderNo}
            data-testid="checkout-confirmation-number"
          >
            #{displayNo}
          </span>
          {dateLabel ? <span>{dateLabel}</span> : null}
          <span className={`${styles.statusBadge} ${STATUS_CLASS[statusKey]}`}>
            {statusLabel}
          </span>
        </p>
        {order.email ? (
          <p className={styles.lead}>
            {order.bank_transfer ? "Havale bilgilerini" : "Sipariş özetini"}{" "}
            <strong>{order.email}</strong> adresine gönderdik.
            Kargoya verildiğinde takip bilgisini de ileteceğiz.
          </p>
        ) : null}
      </header>

      <div className={styles.grid}>
        <div className={styles.main}>
          {order.bank_transfer ? (
            <BankTransferBox info={order.bank_transfer} total={total} orderNo={displayNo} />
          ) : null}

          <section className={styles.card} aria-labelledby="confirm-items">
            <h2 id="confirm-items" className={styles.sectionTitle}>
              Ürünler
              <span className={styles.sectionCount}>{itemCount} ürün</span>
            </h2>
            <ul className={styles.list}>
              {items.map((item, idx) => {
                const handle = item.variant?.product?.handle
                const color =
                  item.variant?.title && item.variant.title !== "Default"
                    ? item.variant.title
                    : null
                const qty = item.quantity ?? 1
                const lineTotal =
                  item.unit_price != null
                    ? Number(item.unit_price) * qty
                    : item.unit_price
                const name = item.title || "Ürün"

                return (
                  <li key={item.id || `${idx}`} className={styles.item}>
                    <span className={styles.thumb}>
                      {item.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail} alt="" loading="lazy" />
                      ) : null}
                    </span>
                    <div className={styles.itemMain}>
                      <p className={styles.itemName}>
                        {handle ? (
                          <Link
                            href={productPath(handle)}
                            className={styles.itemLink}
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </p>
                      <p className={styles.itemSub}>
                        {color ? <span>{color}</span> : null}
                        <span>Adet: {qty}</span>
                      </p>
                    </div>
                    <p className={styles.itemPrice}>{formatTry(lineTotal)}</p>
                  </li>
                )
              })}
            </ul>
          </section>

          {address || methods.length > 0 ? (
            <section className={styles.card} aria-labelledby="confirm-ship">
              <h2 id="confirm-ship" className={styles.sectionTitle}>
                Teslimat
              </h2>
              <div className={styles.shipGrid}>
                {address ? (
                  <div>
                    <p className={styles.label}>Adres</p>
                    <p className={styles.address}>
                      {address.first_name} {address.last_name}
                      <br />
                      {address.address_1}
                      <br />
                      {address.metadata?.district
                        ? `${address.metadata.district}, `
                        : ""}
                      {address.city}
                      {address.postal_code ? ` ${address.postal_code}` : ""}
                      {address.phone ? (
                        <>
                          <br />
                          {address.phone}
                        </>
                      ) : null}
                    </p>
                  </div>
                ) : null}
                {methods.length > 0 ? (
                  <div>
                    <p className={styles.label}>Kargo</p>
                    <ul className={styles.shipMethods}>
                      {methods.map((m, i) => (
                        <li key={i}>
                          {m.name || "Kargo"}
                          {m.amount != null ? (
                            <span>
                              {Number(m.amount) > 0
                                ? formatTry(m.amount)
                                : "Ücretsiz"}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        <aside className={styles.side} aria-labelledby="confirm-totals">
          <section className={`${styles.card} ${styles.summary}`}>
            <h2 id="confirm-totals" className={styles.sectionTitle}>
              Tutar özeti
            </h2>
            <dl className={styles.totals}>
              <div className={styles.totalsRow}>
                <dt>Ara toplam</dt>
                <dd>{formatTry(subtotal)}</dd>
              </div>
              {discount > 0 ? (
                <div className={styles.totalsRow}>
                  <dt>İndirim</dt>
                  <dd>−{formatTry(discount)}</dd>
                </div>
              ) : null}
              <div className={styles.totalsRow}>
                <dt>Kargo</dt>
                <dd>{shipping > 0 ? formatTry(shipping) : "Ücretsiz"}</dd>
              </div>
              <div className={styles.totalsDivider} aria-hidden />
              <div className={`${styles.totalsRow} ${styles.totalsRowStrong}`}>
                <dt>Toplam</dt>
                <dd className={styles.totalsTotal}>
                  <span>{formatTry(total)}</span>
                  <span className={styles.vatNote}>
                    {formatTry(includedVat)} KDV dahil
                  </span>
                </dd>
              </div>
            </dl>
            {actions}
          </section>
        </aside>
      </div>
    </article>
  )
}
