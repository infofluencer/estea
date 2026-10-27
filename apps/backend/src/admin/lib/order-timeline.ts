/**
 * Customer-facing order progress steps (Sportisimo-style timeline).
 * Derived from Medusa payment + fulfillment state — no separate CMS.
 */

export type OrderTimelineStepKey =
  | "received"
  | "preparing"
  | "prepared"
  | "shipped"
  | "delivered"

export type OrderTimelineStep = {
  key: OrderTimelineStepKey
  label: string
}

export const ORDER_TIMELINE_STEPS: readonly OrderTimelineStep[] = [
  { key: "received", label: "Siparişin Alındı" },
  { key: "preparing", label: "Siparişin Hazırlanıyor" },
  { key: "prepared", label: "Siparişin Hazırlandı" },
  { key: "shipped", label: "Kargoya Verildi" },
  { key: "delivered", label: "Teslim Edildi" },
] as const

/** Compact badge labels — same states as timeline steps. */
export const ORDER_STATUS_BADGE: Record<OrderTimelineStepKey, string> = {
  received: "Alındı",
  preparing: "Hazırlanıyor",
  prepared: "Hazırlandı",
  shipped: "Kargoya verildi",
  delivered: "Teslim edildi",
}

/** Kargo takip empty-state copy aligned with current timeline step. */
export function trackingFallbackMessage(
  key: OrderTimelineStepKey,
  opts?: { hasTrackingLink?: boolean }
): string | null {
  switch (key) {
    case "delivered":
      return "Siparişiniz teslim edildi."
    case "shipped":
      return opts?.hasTrackingLink
        ? null
        : "Kargonuz yola çıktı. Takip linki hazır olduğunda burada görünecek."
    case "prepared":
      return "Siparişiniz hazırlandı; kargoya verilince takip bilgisi burada görünecek."
    case "preparing":
      return "Siparişiniz hazırlanıyor; kargo bilgisi yakında eklenecek."
    case "received":
    default:
      return "Ödeme sonrası kargo bilgisi burada görünecek."
  }
}

export type OrderTimelineInput = {
  status?: string | null
  /** `label_printed_at` (kargo etiketi basıldı) / `prepared_at` (admin elle) → Hazırlandı. */
  metadata?: Record<string, unknown> | null
  payment_collections?:
    | {
        status?: string | null
      }[]
    | null
  fulfillments?:
    | {
        shipped_at?: string | Date | null
        delivered_at?: string | Date | null
        canceled_at?: string | Date | null
        labels?:
          | {
              tracking_number?: string | null
              tracking_url?: string | null
            }[]
          | null
        /** Normalize kargo verisi (bkz. escay-backend src/modules/carrier/types.ts). */
        data?: {
          carrier?: string | null
          carrier_name?: string | null
          tracking_number?: string | null
          tracking_url?: string | null
        } | null
      }[]
    | null
}

export type OrderTimelineStepState = OrderTimelineStep & {
  done: boolean
  current: boolean
}

export type OrderTimelineResult = {
  canceled: boolean
  /** Highest reached step index in ORDER_TIMELINE_STEPS (0-based). */
  currentIndex: number
  currentKey: OrderTimelineStepKey
  steps: OrderTimelineStepState[]
}

function isPaid(order: OrderTimelineInput): boolean {
  return (order.payment_collections || []).some((pc) => {
    const st = (pc.status || "").toLowerCase()
    return st === "completed" || st === "authorized" || st === "captured"
  })
}

function activeFulfillments(order: OrderTimelineInput) {
  return (order.fulfillments || []).filter((f) => !f.canceled_at)
}

function isDelivered(order: OrderTimelineInput): boolean {
  return activeFulfillments(order).some((f) => Boolean(f.delivered_at))
}

// Yalnız shipped_at: takip no etiket oluşunca, kurye paketi almadan gelebilir.
function isShipped(order: OrderTimelineInput): boolean {
  return activeFulfillments(order).some((f) => Boolean(f.shipped_at))
}

function hasMetaDate(order: OrderTimelineInput, key: string): boolean {
  const value = order.metadata?.[key]
  return typeof value === "string" && value.trim() !== ""
}

// Gönderi (fulfillment) ödeme sonrası otomatik açılır; sipariş ancak etiketi
// basılınca (ya da admin elle işaretleyince) "Hazırlandı" sayılır.
function isPrepared(order: OrderTimelineInput): boolean {
  return hasMetaDate(order, "label_printed_at") || hasMetaDate(order, "prepared_at")
}

/**
 * Resolve which timeline step the order is on.
 * Canceled orders return `canceled: true` — UI should hide the stepper.
 */
export function resolveOrderTimeline(
  order: OrderTimelineInput
): OrderTimelineResult {
  if ((order.status || "").toLowerCase() === "canceled") {
    return {
      canceled: true,
      currentIndex: 0,
      currentKey: "received",
      steps: ORDER_TIMELINE_STEPS.map((s, i) => ({
        ...s,
        done: false,
        current: i === 0,
      })),
    }
  }

  let currentIndex = 0
  if (isDelivered(order)) {
    currentIndex = 4
  } else if (isShipped(order)) {
    currentIndex = 3
  } else if (isPrepared(order) && (isPaid(order) || activeFulfillments(order).length > 0)) {
    currentIndex = 2
  } else if (isPaid(order) || activeFulfillments(order).length > 0) {
    currentIndex = 1
  } else {
    currentIndex = 0
  }

  const currentKey = ORDER_TIMELINE_STEPS[currentIndex].key
  const steps = ORDER_TIMELINE_STEPS.map((s, i) => ({
    ...s,
    done: i < currentIndex || (i === currentIndex && currentIndex === 4),
    current: i === currentIndex,
  }))

  return {
    canceled: false,
    currentIndex,
    currentKey,
    steps,
  }
}

/** Customer-facing status line for lists / confirmation (timeline-aligned). */
export function formatOrderStatusLabel(order: OrderTimelineInput): string {
  if ((order.status || "").toLowerCase() === "canceled") return "İptal"
  if ((order.status || "").toLowerCase() === "archived") return "Arşiv"
  const tl = resolveOrderTimeline(order)
  return ORDER_STATUS_BADGE[tl.currentKey]
}

/** Next admin action to advance one step, or null if complete/canceled. */
export function nextOrderStatusAction(
  order: OrderTimelineInput
): "prepare" | "ship" | "deliver" | null {
  const tl = resolveOrderTimeline(order)
  if (tl.canceled) return null
  switch (tl.currentKey) {
    case "received":
    case "preparing":
      return "prepare"
    case "prepared":
      return "ship"
    case "shipped":
      return "deliver"
    default:
      return null
  }
}
