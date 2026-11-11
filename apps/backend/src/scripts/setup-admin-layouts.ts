import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { setLayoutConfigurationWorkflow } from "@medusajs/medusa/core-flows"

/**
 * Admin sayfa düzenlerinin ortak varsayılanı (Medusa 2.18 layout ayarı).
 *
 * Sipariş sayfası: sol (geniş) sütun iş sütunudur — sipariş başlığı, sonra
 * sıradaki iş (durum, havale, etiket, kargo, iade ve değişim özeti), sonra ürünler ve gönderi.
 * Sağ sütun yalnız bilgi: müşteri, fatura, sözleşme, olaylar. Tutarlar Özet'te
 * olduğu için Medusa'nın Ödemeler kartı, Es Çay Olaylar'ı tuttuğu için Medusa'nın
 * Aktivite kartı gizlenir. Geliştirici kutuları (JSON, Meta Veriler) da gizlenir.
 * Kullanıcı panelden kendi düzenini yaparsa o geçerli olur;
 * bu script yalnız "varsayılan"ı yazar. Tekrar çalıştırmak güvenli.
 *
 *   npx medusa exec ./src/scripts/setup-admin-layouts.ts
 *
 * Widget kimlikleri src/admin/widgets/*.tsx config.id ile aynı olmalı.
 */
type WidgetPref = { order?: number; section?: string; hidden?: boolean }

const ORDER_MAIN = [
  "core:OrderActiveEditSection",
  "core:ActiveOrderClaimSection",
  "core:ActiveOrderExchangeSection",
  "core:ActiveOrderReturnSection",
  "core:OrderGeneralSection",
  "widget:escay-order-status",
  "widget:escay-order-bank-transfer",
  "widget:escay-order-label",
  "widget:escay-order-shipping",
  "widget:escay-order-returns",
  "core:OrderSummarySection",
  "core:OrderFulfillmentSection",
]

const ORDER_SIDE = [
  "core:OrderCustomerSection",
  "widget:escay-order-invoice",
  "widget:escay-order-contracts",
  "widget:escay-order-events",
]

const DEV_SECTIONS = ["core:JsonViewSection", "core:RequiredPermissionsSection"]

function ordered(ids: string[], section: string): Record<string, WidgetPref> {
  return Object.fromEntries(ids.map((id, i) => [id, { order: (i + 1) * 10, section }]))
}

function hidden(ids: string[]): Record<string, WidgetPref> {
  return Object.fromEntries(ids.map((id) => [id, { hidden: true }]))
}

const LAYOUTS: Record<string, Record<string, WidgetPref>> = {
  "order.details": {
    ...ordered(ORDER_MAIN, "main"),
    ...ordered(ORDER_SIDE, "side"),
    // Sipariş metadata'sı sistem kayıtları (fatura, PayTR, kargo) — elle düzenlenmemeli.
    ...hidden([...DEV_SECTIONS, "core:MetadataSection", "core:OrderPaymentSection", "core:OrderActivitySection"]),
  },
  // Ürün metadata'sı mağazada özellik etiketi olarak kullanılıyor (spec-labels) — görünür kalır.
  "product.details": hidden(DEV_SECTIONS),
  "customer.details": hidden(DEV_SECTIONS),
}

export default async function setupAdminLayouts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  // Varsayılan düzen kullanıcıya bağlı değil; workflow yine de bir kullanıcı ister
  // (etkin görünümü onun için "varsayılan"a çeker).
  const { data: users } = await query.graph({ entity: "user", fields: ["id"], pagination: { take: 1 } })
  const userId = (users?.[0] as { id?: string } | undefined)?.id
  if (!userId) throw new Error("Admin kullanıcısı yok — önce `npx medusa user` ile oluşturun.")

  for (const [zone, widgets] of Object.entries(LAYOUTS)) {
    await setLayoutConfigurationWorkflow(container).run({
      input: { zone, user_id: userId, is_default: true, configuration: { widgets } },
    })
    logger.info(`[admin-layouts] ${zone}: ${Object.keys(widgets).length} ayar yazıldı`)
  }
}
