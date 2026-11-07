import { model } from "@medusajs/framework/utils"

/**
 * Bir PayTR ödeme denemesinin kalıcı kaydı (merchant_oid → sepet + tutar + ürünler).
 *
 * Sipariş ancak ödeme başarılı olunca oluştuğu için geç gelen bildirimin bağlanacağı
 * sipariş yoktur; Medusa ödeme oturumu da sepet değişince silinir. Bu kayıt silinmez,
 * bildirim ne kadar geç gelirse gelsin sahibini buradan bulur.
 *
 * Durumlar:
 *   pending   iframe açıldı, ödeme bilgisi yok
 *   paid      para alındı, sipariş / tahsilat henüz tamamlanmadı (iş tekrar dener)
 *   completed sipariş oluştu, tahsilat kaydedildi
 *   review    para alındı, elle karar gerekiyor (bkz. review_kind)
 *   refunded  sipariş oluşmadan PayTR'de iade edilmiş
 *   expired   süre doldu, sorgu bırakıldı (geç bildirim gelirse yine işlenir)
 */
const PaytrCheckout = model
  .define("paytr_checkout", {
    id: model.id({ prefix: "ptco" }).primaryKey(),
    merchant_oid: model.text().unique(),
    cart_id: model.text(),
    session_id: model.text().nullable(),
    payment_collection_id: model.text().nullable(),
    amount_kurus: model.number(),
    currency_code: model.text().default("try"),
    email: model.text().nullable(),
    /** { variant_id, quantity }[] — ödeme anındaki sepet */
    items: model.json().nullable(),
    status: model
      .enum(["pending", "paid", "completed", "review", "refunded", "expired"])
      .default("pending"),
    paid_at: model.dateTime().nullable(),
    paid_kurus: model.number().nullable(),
    /** callback | status_query | session */
    paid_source: model.text().nullable(),
    order_id: model.text().nullable(),
    review_kind: model.text().nullable(),
    last_error: model.text().nullable(),
    failed_attempts: model.number().default(0),
    retry_count: model.number().default(0),
    last_polled_at: model.dateTime().nullable(),
    alerted_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["cart_id"] }, { on: ["status"] }])

export default PaytrCheckout
