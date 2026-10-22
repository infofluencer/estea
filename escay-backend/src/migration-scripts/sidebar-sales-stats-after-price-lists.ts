import { MedusaContainer } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

/**
 * Sol menü: "Satış İstatistikleri" Fiyat Listeleri'nin hemen altında.
 *
 * Önceki script (sidebar-sales-stats-first, canlıda çalıştı) sayfayı menünün
 * en üstüne almıştı. Bu script o iki tercihi sistem varsayılanından siler →
 * menü doğal sırasına döner: çekirdek menü (… Fiyat Listeleri), ardından
 * eklenti sayfaları rank sırasıyla; sales-stats rank 0 ile ilk eklenti.
 * Diğer tercihler korunur. Kişisel düzen kaydetmiş kullanıcıda kişisel düzen önceliklidir.
 */
const ZONE = "sidebar"
const REMOVE = ["core:Searchbar", "core:nav:/sales-stats"]

type WidgetPref = { hidden?: boolean; section?: string; order?: number }

export default async function sidebarSalesStatsAfterPriceLists({
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
  if (!REMOVE.some((id) => id in widgets)) return

  for (const id of REMOVE) delete widgets[id]
  await settings.setSystemDefaultLayoutConfiguration(ZONE, { widgets })
  logger.info(`[layout] ${ZONE} varsayılan düzeni: Satış İstatistikleri Fiyat Listeleri'nin altında`)
}
