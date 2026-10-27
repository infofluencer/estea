import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Siparişler sayfası varsayılan düzeni: "Etiketleri toplu yazdır" tablonun ÜSTÜNDE.
 *
 * Medusa 2.18'de widget zone'undaki .before/.after yok sayılır; sıra
 * "Sayfayı düzenle" tercihinden (settings modülü, layout_configuration) gelir.
 * Bu script herkes için varsayılan (system default) düzeni bir kez yazar —
 * mevcut varsayılan varsa diğer widget tercihlerini korur. Kişisel düzen
 * kaydetmiş kullanıcıda kişisel düzen önceliklidir.
 *
 * Kimlikler: core:OrderListTable (dashboard), widget:escay-bulk-labels
 * (order-bulk-labels-widget.tsx config.id).
 */
const ZONE = "order.list"
const BULK_LABELS = "widget:escay-bulk-labels"
const ORDER_TABLE = "core:OrderListTable"

type WidgetPref = { hidden?: boolean; section?: string; order?: number }

export default async function orderListBulkLabelsFirst({
  container,
}: {
  container: MedusaContainer
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const settings = container.resolve(Modules.SETTINGS) as {
    getSystemDefaultLayoutConfiguration: (
      zone: string
    ) => Promise<{ configuration?: { widgets?: Record<string, WidgetPref> } } | null>
    setSystemDefaultLayoutConfiguration: (
      zone: string,
      configuration: { widgets: Record<string, WidgetPref> }
    ) => Promise<unknown>
  }

  const current = await settings.getSystemDefaultLayoutConfiguration(ZONE)
  const widgets: Record<string, WidgetPref> = { ...(current?.configuration?.widgets || {}) }

  widgets[BULK_LABELS] = { ...widgets[BULK_LABELS], hidden: false, order: -1 }
  widgets[ORDER_TABLE] = { ...widgets[ORDER_TABLE], order: Math.max(0, widgets[ORDER_TABLE]?.order ?? 0) }

  await settings.setSystemDefaultLayoutConfiguration(ZONE, { widgets })
  logger.info(`[layout] ${ZONE} varsayılan düzeni: toplu etiket widget'ı tablonun üstünde`)
}
