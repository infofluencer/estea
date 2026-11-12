import Link from "next/link"
import { formatTry, PRODUCT_IMAGE } from "@/lib/medusa"
import { resolveOrderNumberLabel } from "@escay/shared/order-number"
import {
  ORDER_STATUS_BADGE,
  resolveOrderTimeline,
  trackingFallbackMessage,
  type OrderTimelineStepKey,
} from "@escay/shared/order-timeline"
import { resolveReturnStatus } from "@escay/shared/return-status"
import { OrderReturnRequest } from "./OrderReturnRequest"
import { BankTransferBox } from "@/components/checkout/BankTransferBox"
import type { OrderDetailView, OrderReturnContext } from "./order-types"
import styles from "./order-detail.module.css"
import { productPath } from "@/lib/urls"
import { optimizedImg } from "@/lib/image"

function formatOrderDate(value?: string | Date | null) {
  if (!value) return "—"
  try {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

type TrackingEntry = {
  key: string
  provider?: string | null
  number?: string | null
  url?: string | null
}

function collectTrackingEntries(
  fulfillments: NonNullable<OrderDetailView["fulfillments"]>
): TrackingEntry[] {
  const entries: TrackingEntry[] = []

  for (const [fi, f] of fulfillments.entries()) {
    const provider = f.data?.carrier_name || null
    const dataUrl = f.data?.tracking_url?.trim() || null
    const dataNumber = f.data?.tracking_number || null
    const labels = f.labels || []

    if (labels.length === 0) {
      if (dataUrl || dataNumber) {
        entries.push({
          key: f.id || `f-${fi}`,
          provider,
          number: dataNumber,
          url: dataUrl,
        })
      }
      continue
    }

    for (const [li, label] of labels.entries()) {
      const url = label.tracking_url?.trim() || dataUrl
      const number = label.tracking_number || dataNumber
      if (!url && !number) continue
      entries.push({
        key: `${f.id || fi}-${li}`,
        provider,
        number,
        url,
      })
    }
  }

  return entries
}

function statusBadgeClass(key: OrderTimelineStepKey | "canceled") {
  switch (key) {
    case "canceled":
      return styles.status_canceled
    case "delivered":
      return styles.status_delivered
    case "shipped":
      return styles.status_shipped
    case "prepared":
      return styles.status_prepared
    case "preparing":
      return styles.status_preparing
    case "received":
    default:
      return styles.status_pending
  }
}

function ItemsList({ order }: { order: OrderDetailView }) {
  return (
    <ul className={styles.list}>
      {(order.items || []).map((item, idx) => {
        const handle = item.variant?.product?.handle
        const color = item.variant?.title
        const sku = item.variant?.sku || item.variant_sku
        const thumb = item.thumbnail || PRODUCT_IMAGE
        const titleNode = handle ? (
          <Link href={`${productPath(handle)}`} className={styles.itemLink}>
            {item.title || "Ürün"}
          </Link>
        ) : (
          <span>{item.title || "Ürün"}</span>
        )

        return (
          <li key={item.id || `${idx}`} className={styles.itemCard}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img {...optimizedImg(thumb, "120px")} alt="" className={styles.itemThumb} loading="lazy" />
            <div className={styles.itemBody}>
              <div className={styles.itemTitleRow}>
                {titleNode}
                <span className={styles.itemPrice}>
                  {formatTry(item.unit_price)}
                </span>
              </div>
              <div className={styles.itemMeta}>
                {color ? <span>{color}</span> : null}
                {color ? <span aria-hidden>·</span> : null}
                <span>× {item.quantity ?? 1}</span>
                {sku ? <span aria-hidden>·</span> : null}
                {sku ? <span>SKU: {sku}</span> : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function OrderTimeline({ order }: { order: OrderDetailView }) {
  const timeline = resolveOrderTimeline(order)
  if (timeline.canceled) return null

  return (
    <ol
      className={styles.timeline}
      aria-label="Sipariş durumu"
      data-testid="order-timeline"
    >
      {timeline.steps.map((step) => (
        <li
          key={step.key}
          className={`${styles.timelineStep} ${
            step.done
              ? styles.timelineStepDone
              : step.current
                ? styles.timelineStepCurrent
                : styles.timelineStepPending
          }`}
          data-step={step.key}
        >
          <span className={styles.timelineDot} aria-hidden />
          <span className={styles.timelineLabel}>{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

function TrackingSection({
  stepKey,
  entries,
}: {
  stepKey: OrderTimelineStepKey
  entries: TrackingEntry[]
}) {
  const hasLink = entries.some((e) => Boolean(e.url))
  const fallback = trackingFallbackMessage(stepKey, {
    hasTrackingLink: hasLink,
  })

  return (
    <section
      className={`${styles.section} ${styles.trackingBlock}`}
      aria-labelledby="order-tracking"
    >      <h2 id="order-tracking" className={styles.sectionTitle}>
        Kargo takip
      </h2>
      {entries.length === 0 ? (
        <p className={styles.muted}>{fallback}</p>
      ) : (
        <div className={styles.trackList}>
          {entries.map((entry) => (
            <div key={entry.key} className={styles.trackRow}>
              {entry.url ? (
                <a
                  href={entry.url}
                  className="cart-cta cart-cta--primary"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="order-tracking-link"
                >
                  Kargonu takip et
                </a>
              ) : null}
              {entry.provider ? (
                <span className={styles.provider}>{entry.provider}</span>
              ) : null}
              {entry.number ? (
                <span className={styles.trackNumber}>{entry.number}</span>
              ) : null}
              {!entry.url && !entry.number ? (
                <span className={styles.muted}>Takip numarası bekleniyor.</span>
              ) : null}
            </div>
          ))}
          {stepKey === "delivered" && !hasLink && fallback ? (
            <p className={styles.muted}>{fallback}</p>
          ) : null}
        </div>
      )}
    </section>
  )
}

export function OrderDetail({
  order,
  returnContext,
}: {
  order: OrderDetailView
  returnContext?: OrderReturnContext | null
}) {
  const displayNo = resolveOrderNumberLabel(order)
  const timeline = resolveOrderTimeline(order)
  const isCanceled = timeline.canceled
  const badgeKey = isCanceled ? ("canceled" as const) : timeline.currentKey
  const badgeLabel = isCanceled
    ? "İptal"
    : order.bank_transfer
      ? "Ödeme bekleniyor"
      : ORDER_STATUS_BADGE[timeline.currentKey]

  const fulfillments = order.fulfillments || []
  const trackingEntries = collectTrackingEntries(fulfillments)
  const existingReturns = (order.returns || []).filter((r) => r.id)
  const itemTitles = new Map(
    (order.items || []).map((it) => [it.id, it.title || "Ürün"] as const)
  )
  const hasExchange = existingReturns.some(
    (r) => resolveReturnStatus(r)?.kind === "exchange"
  )

  return (
    <article className={styles.wrap} data-testid="order-detail">
      <header className={styles.head}>
        <h1 className={styles.title} data-testid="order-detail-number">
          Sipariş #{displayNo}
        </h1>
        <p className={styles.meta}>
          <span
            data-testid="order-detail-status"
            className={`${styles.statusBadge} ${statusBadgeClass(badgeKey)}`}
          >
            {badgeLabel}
          </span>
          <span>{formatOrderDate(order.created_at)}</span>
          {order.email ? <span>{order.email}</span> : null}
        </p>
        {isCanceled ? (
          <p className={styles.canceledNote}>
            Bu sipariş iptal edildi. Ödeme alındıysa iade süreci e-posta ile
            bilgilendirilir.
          </p>
        ) : null}
      </header>

      {order.bank_transfer && !isCanceled ? (
        <BankTransferBox
          info={order.bank_transfer}
          total={Number(order.total) || 0}
          orderNo={displayNo}
        />
      ) : null}

      {isCanceled ? (
        <div className={styles.canceledLayout}>
          <section className={styles.section} aria-labelledby="order-items">
            <h2 id="order-items" className={styles.sectionTitle}>
              Ürünler
            </h2>
            <ItemsList order={order} />
          </section>
          <section className={styles.section} aria-labelledby="order-totals">
            <h2 id="order-totals" className={styles.sectionTitle}>
              Toplam
            </h2>
            <p className={styles.canceledTotal}>{formatTry(order.total)}</p>
          </section>
        </div>
      ) : (
        <div className={styles.bodyStack}>
          <OrderTimeline order={order} />
          <div className={styles.layout}>
            <div className={styles.mainCol}>
              <section
                className={`${styles.section} ${styles.productsBlock}`}
                aria-labelledby="order-items"
              >
                <h2 id="order-items" className={styles.sectionTitle}>
                  Ürünler
                </h2>
                <ItemsList order={order} />
              </section>

              <TrackingSection
                stepKey={timeline.currentKey}
                entries={trackingEntries}
              />
            </div>

            <aside className={styles.sideCol}>
              <section className={styles.section} aria-labelledby="order-totals">
                <h2 id="order-totals" className={styles.sectionTitle}>
                  Tutarlar
                </h2>
                <dl className={styles.totals}>
                  <div className={styles.totalsRow}>
                    <dt>Ürünler</dt>
                    <dd>
                      {formatTry(
                        order.original_item_total ??
                          (Number(order.discount_total) > 0 &&
                          order.item_total != null
                            ? Number(order.item_total) +
                              Number(order.discount_total)
                            : (order.item_subtotal ?? order.item_total))
                      )}
                    </dd>
                  </div>
                  {Number(order.discount_total) > 0 ? (
                    <div className={styles.totalsRow}>
                      <dt>İndirim</dt>
                      <dd>−{formatTry(order.discount_total)}</dd>
                    </div>
                  ) : null}
                  <div
                    className={`${styles.totalsRow} ${styles.totalsRowStrong}`}
                  >
                    <dt>Toplam</dt>
                    <dd>{formatTry(order.total)}</dd>
                  </div>
                </dl>
              </section>

              {order.shipping_address ? (
                <section
                  className={styles.section}
                  aria-labelledby="order-address"
                >
                  <h2 id="order-address" className={styles.sectionTitle}>
                    Teslimat adresi
                  </h2>
                  <p className={styles.address}>
                    {order.shipping_address.first_name}{" "}
                    {order.shipping_address.last_name}
                    <br />
                    {order.shipping_address.address_1}
                    <br />
                    {order.shipping_address.metadata?.district
                      ? `${order.shipping_address.metadata.district}, `
                      : ""}
                    {order.shipping_address.city}{" "}
                    {order.shipping_address.postal_code}
                    <br />
                    {order.shipping_address.phone}
                  </p>
                </section>
              ) : null}

              {existingReturns.length > 0 ? (
                <section
                  className={styles.section}
                  aria-labelledby="order-returns"
                >
                  <h2 id="order-returns" className={styles.sectionTitle}>
                    {hasExchange ? "İade ve değişim" : "İade talepleri"}
                  </h2>
                  <ul className={styles.list}>
                    {existingReturns.map((r) => {
                      const st = resolveReturnStatus(r)
                      const titles = Array.from(
                        new Set(
                          (r.items || [])
                            .map((it) => (it.item_id ? itemTitles.get(it.item_id) : null))
                            .filter((t): t is string => Boolean(t))
                        )
                      )
                      return (
                        <li
                          key={r.id}
                          className={styles.returnEntry}
                          data-testid="order-return"
                        >
                          <div className={styles.returnHead}>
                            <span className={styles.returnPill} data-tone={st?.tone}>
                              {st?.label || "İade talebi"}
                            </span>
                            {r.created_at ? (
                              <span className={styles.returnDate}>
                                {formatOrderDate(r.created_at)}
                              </span>
                            ) : null}
                          </div>
                          {titles.length > 0 ? (
                            <p className={styles.returnItems}>{titles.join(", ")}</p>
                          ) : null}
                          {st?.refundAmount != null ? (
                            <p className={styles.returnAmount}>
                              İade edilen tutar: {formatTry(st.refundAmount)}
                            </p>
                          ) : null}
                          {st?.note ? (
                            <p className={styles.returnNote}>{st.note}</p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}

              {returnContext && timeline.currentKey === "delivered" ? (
                <OrderReturnRequest
                  order={order}
                  returnContext={returnContext}
                />
              ) : null}
            </aside>
          </div>
        </div>
      )}
    </article>
  )
}
