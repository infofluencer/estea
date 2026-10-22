import { model } from "@medusajs/framework/utils"

/**
 * Operasyon olayı — ödeme / iptal / kargo gibi takip edilmesi gereken anlar.
 * Admin "Logs" sayfası ve sipariş detayındaki "Olaylar" kutusu okur.
 */
const OpsEvent = model
  .define("ops_event", {
    id: model.id({ prefix: "opsev" }).primaryKey(),
    /** payment.succeeded, payment.failed, order.canceled_unpaid, shipment.created, shipment.failed, ... */
    kind: model.text().searchable(),
    level: model.enum(["info", "warning", "error"]).default("info"),
    title: model.text(),
    detail: model.text().nullable(),
    order_id: model.text().nullable(),
    order_display_id: model.text().nullable(),
    data: model.json().nullable(),
  })
  .indexes([{ on: ["order_id"] }, { on: ["kind"] }, { on: ["level"] }])

export default OpsEvent
