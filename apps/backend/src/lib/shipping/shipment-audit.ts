import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { getConfiguredCarrier } from "../../modules/carrier/registry"
import { carrierErrorText, readFulfillmentData } from "../../modules/carrier/types"
import { recordOpsEvent } from "../ops-events"

/**
 * Günlük salt okunur kargo denetimi (Mareen dersi: tutarsızlıklar elle bulunuyordu).
 *
 * Hiçbir şeyi değiştirmez; bulguları `ops_event` tablosuna yazar (Logs sayfası).
 * Bulgu başlığı günün tarihini taşır → aynı bulgu günde bir kez düşer, sorun
 * sürüyorsa ertesi gün yeniden görünür.
 */

export type AuditFulfillment = {
  id: string
  created_at?: string | Date | null
  shipped_at?: string | Date | null
  delivered_at?: string | Date | null
  canceled_at?: string | Date | null
  data?: Record<string, unknown> | null
}

export type AuditOrder = {
  id: string
  display_id?: number | string | null
  status?: string | null
  created_at?: string | Date | null
  payment_collections?: { status?: string | null }[] | null
  fulfillments?: AuditFulfillment[] | null
}

export type AuditFindingKind =
  | "paid_without_fulfillment"
  | "stale_label"
  | "stale_transit"
  | "canceled_with_active_fulfillment"
  | "duplicate_shipment_ref"

export type AuditFinding = {
  kind: AuditFindingKind
  level: "warning" | "error"
  orderId: string
  orderDisplayId: string | null
  title: string
  detail: string
  data?: Record<string, unknown>
}

export type AuditOptions = {
  now?: Date
  /** Etiket/hazırlandı kaydı bu kadar gündür kargoya verilmemişse uyar (aracılar ~7 günde sessizce iptal eder). */
  staleLabelDays?: number
  /** Kargoya verilmiş ama bu kadar gündür teslim edilmemişse uyar. */
  staleTransitDays?: number
  /** Ödendi ama kayıt yok — bu kadar saatten yeni siparişler atlanır. */
  paidGraceHours?: number
}

const PAID = new Set(["captured", "completed"])

function ms(value: string | Date | null | undefined): number | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isFinite(t) ? t : null
}

function days(from: string | Date | null | undefined, now: number): number {
  const t = ms(from)
  return t === null ? 0 : Math.floor((now - t) / 86_400_000)
}

export function envInt(name: string, fallback: number): number {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Saf denetim: sipariş satırları → bulgular. */
export function auditOrders(orders: AuditOrder[], opts: AuditOptions = {}): AuditFinding[] {
  const now = (opts.now ?? new Date()).getTime()
  const staleLabelDays = opts.staleLabelDays ?? 4
  const staleTransitDays = opts.staleTransitDays ?? 10
  const paidGraceMs = (opts.paidGraceHours ?? 24) * 3_600_000
  const findings: AuditFinding[] = []
  const byShipmentRef = new Map<string, { orderId: string; display: string | null; fulfillmentId: string }[]>()

  for (const o of orders) {
    const display = o.display_id != null ? String(o.display_id) : null
    const label = display ? `#${display}` : o.id
    const canceled = (o.status || "").toLowerCase() === "canceled"
    const paid = (o.payment_collections || []).some((p) => PAID.has((p.status || "").toLowerCase()))
    const active = (o.fulfillments || []).filter((f) => !f.canceled_at)
    const push = (f: Omit<AuditFinding, "orderId" | "orderDisplayId">) =>
      findings.push({ ...f, orderId: o.id, orderDisplayId: display })

    if (canceled && active.length) {
      push({
        kind: "canceled_with_active_fulfillment",
        level: "error",
        title: `İptal siparişte açık gönderi: ${label}`,
        detail: `Sipariş iptal edilmiş ama ${active.length} kargo kaydı hâlâ aktif. Firmadan iptalini doğrulayın; kayıt(lar): ${active.map((f) => f.id).join(", ")}.`,
        data: { fulfillment_ids: active.map((f) => f.id) },
      })
    }

    if (!canceled && paid && !active.length) {
      const created = ms(o.created_at)
      if (created === null || now - created >= paidGraceMs) {
        push({
          kind: "paid_without_fulfillment",
          level: "warning",
          title: `Ödendi ama kargo kaydı yok: ${label}`,
          detail: `Ödeme alınmış, ${days(o.created_at, now)} gündür kargo kaydı açılmamış. Sipariş sayfasından "Gönderi aç" ya da "Hazırlandı" ile açın.`,
        })
      }
    }

    for (const f of active) {
      const d = readFulfillmentData(f.data)
      if (d.shipment_ref) {
        const key = `${d.carrier || ""}:${d.shipment_ref}`
        const list = byShipmentRef.get(key) || []
        list.push({ orderId: o.id, display, fulfillmentId: f.id })
        byShipmentRef.set(key, list)
      }
      if (canceled) continue
      if (!f.shipped_at) {
        const age = days(f.created_at, now)
        if (age >= staleLabelDays) {
          push({
            kind: "stale_label",
            level: "warning",
            title: `${age} gündür kargoya verilmedi: ${label}`,
            detail: d.shipment_ref
              ? `Gönderi firmada açık (ref ${d.shipment_ref}${d.tracking_number ? `, takip ${d.tracking_number}` : ""}) ama kurye teslim almadı. Aracılar bekleyen gönderiyi ~7 günde sessizce iptal eder; paketi teslim edin ya da firmada durumunu kontrol edin.`
              : `Kayıt "Hazırlandı"da bekliyor; paket kargoya verildiyse takip numarasıyla "Kargoya ver" yapın.`,
            data: { fulfillment_id: f.id, shipment_ref: d.shipment_ref || null, age_days: age },
          })
        }
      } else if (!f.delivered_at) {
        const age = days(f.shipped_at, now)
        if (age >= staleTransitDays) {
          push({
            kind: "stale_transit",
            level: "warning",
            title: `${age} gündür teslim edilmedi: ${label}`,
            detail: `Kargoya verilmiş ama teslim bildirimi gelmedi${d.tracking_number ? ` (takip ${d.tracking_number})` : ""}. Firmadan sorgulayın; teslim edildiyse admin'den "Teslim edildi" işaretleyin.`,
            data: { fulfillment_id: f.id, tracking_number: d.tracking_number || null, age_days: age },
          })
        }
      }
    }
  }

  for (const [key, list] of byShipmentRef) {
    const orderIds = new Set(list.map((l) => l.orderId))
    if (list.length < 2) continue
    const labels = [...new Set(list.map((l) => (l.display ? `#${l.display}` : l.orderId)))].join(", ")
    findings.push({
      kind: "duplicate_shipment_ref",
      level: "error",
      orderId: list[0].orderId,
      orderDisplayId: list[0].display,
      title: `Aynı gönderi ${orderIds.size > 1 ? "iki siparişte" : "iki kayıtta"}: ${key.split(":").slice(1).join(":")}`,
      detail: `Firma gönderi kimliği birden fazla aktif kayıtta (${labels}). Yanlış olanı iptal edin ya da doğru siparişe bağlayın.`,
      data: { shipment_ref: key, fulfillment_ids: list.map((l) => l.fulfillmentId), order_ids: [...orderIds] },
    })
  }

  return findings
}

const ORDER_FIELDS = [
  "id",
  "display_id",
  "status",
  "created_at",
  "payment_collections.status",
  "fulfillments.id",
  "fulfillments.created_at",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
  "fulfillments.data",
]

export async function loadAuditOrders(container: MedusaContainer, lookbackDays: number): Promise<AuditOrder[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const since = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()
  const take = 200
  const out: AuditOrder[] = []
  for (let page = 0; page < 200; page++) {
    const { data } = await query.graph({
      entity: "order",
      fields: ORDER_FIELDS,
      filters: { created_at: { $gte: since } },
      pagination: { take, skip: page * take, order: { created_at: "DESC" } },
    })
    const rows = (data as AuditOrder[]) || []
    out.push(...rows)
    if (rows.length < take) break
  }
  return out
}

export type AuditRunResult = { checked: number; findings: AuditFinding[]; healthWarnings: string[] }

/** Denetimi çalıştırır, bulguları olay kaydına yazar. Asla throw etmez (job güvenli). */
export async function runShipmentAudit(container: MedusaContainer, opts: AuditOptions & { lookbackDays?: number } = {}): Promise<AuditRunResult> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const today = (opts.now ?? new Date()).toISOString().slice(0, 10)
  const result: AuditRunResult = { checked: 0, findings: [], healthWarnings: [] }

  try {
    const orders = await loadAuditOrders(container, opts.lookbackDays ?? envInt("SHIPPING_AUDIT_LOOKBACK_DAYS", 90))
    result.checked = orders.length
    result.findings = auditOrders(orders, {
      now: opts.now,
      staleLabelDays: opts.staleLabelDays ?? envInt("SHIPPING_AUDIT_STALE_LABEL_DAYS", 4),
      staleTransitDays: opts.staleTransitDays ?? envInt("SHIPPING_AUDIT_STALE_TRANSIT_DAYS", 10),
      paidGraceHours: opts.paidGraceHours,
    })
    for (const f of result.findings) {
      await recordOpsEvent(container, {
        kind: "shipment.audit",
        level: f.level,
        title: `${f.title} · ${today}`,
        detail: f.detail,
        orderId: f.orderId,
        data: { audit: f.kind, ...(f.data || {}) },
        oncePerTitle: true,
      })
    }
  } catch (error) {
    logger.error(`[shipment-audit] denetim çalışmadı: ${carrierErrorText(error)}`)
  }

  const adapter = getConfiguredCarrier()
  if (adapter?.healthCheck) {
    try {
      const health = await adapter.healthCheck()
      const warnings = [...health.warnings]
      if (!health.ok) warnings.unshift("Hesap kontrolü başarısız döndü.")
      if (
        typeof health.balance === "number" &&
        typeof health.lowBalanceThreshold === "number" &&
        health.balance < health.lowBalanceThreshold
      ) {
        warnings.push(`Bakiye düşük: ${health.balance.toFixed(2)} TL (eşik ${health.lowBalanceThreshold.toFixed(2)} TL). Bakiye sıfırken gönderi açılmaz.`)
      }
      result.healthWarnings = warnings
      for (const w of warnings) {
        await recordOpsEvent(container, {
          kind: "carrier.health",
          level: "warning",
          title: `${adapter.name}: ${w} · ${today}`,
          oncePerTitle: true,
        })
      }
    } catch (error) {
      result.healthWarnings = [carrierErrorText(error)]
      await recordOpsEvent(container, {
        kind: "carrier.health",
        level: "error",
        title: `${adapter.name} hesap kontrolü yapılamadı · ${today}`,
        detail: carrierErrorText(error),
        oncePerTitle: true,
      })
    }
  }

  await recordOpsEvent(container, {
    kind: "shipment.audit",
    level: "info",
    title: `Kargo denetimi: ${result.findings.length} bulgu (${result.checked} sipariş) · ${today}`,
    detail: result.findings.length
      ? result.findings.map((f) => `• ${f.title}`).slice(0, 40).join("\n")
      : "Tutarsızlık bulunmadı.",
    data: { counts: countBy(result.findings) },
    oncePerTitle: true,
  })
  return result
}

function countBy(findings: AuditFinding[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of findings) out[f.kind] = (out[f.kind] || 0) + 1
  return out
}
