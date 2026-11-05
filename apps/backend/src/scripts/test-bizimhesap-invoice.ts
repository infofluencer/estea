/**
 * BizimHesap bağlantı testi. Varsayılan: yalnız gövdeyi yazdırır, istek ATMAZ.
 *
 *   npm run test:bizimhesap
 *   BIZIMHESAP_TEST_SEND=1 npm run test:bizimhesap
 *
 * BizimHesap'ın test ortamı yok ve API'de silme yok: gönderim hesapta GERÇEK kayıt
 * açar, panelden elle silinmesi gerekir. Yalnız ilk bağlantıyı doğrulamak için.
 */

import { BIZIMHESAP_MODULE, BizimhesapError } from "../modules/bizimhesap"
import { buildAddInvoicePayload } from "../modules/bizimhesap/payload"
import BizimhesapModuleService from "../modules/bizimhesap/service"
import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function testBizimhesapInvoice({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const bizimhesap = container.resolve(BIZIMHESAP_MODULE) as BizimhesapModuleService
  const conn = bizimhesap.getConnectionStatus()

  const { payload, total } = buildAddInvoicePayload({
    firmId: bizimhesap.getFirmId(),
    invoiceNo: `TEST-${Date.now()}`,
    note: "ENTEGRASYON TESTİ — SİLİNECEK",
    customer: {
      customerId: "ESCAY-ENTEGRASYON-TEST",
      title: "ENTEGRASYON TESTİ — SİLİNECEK",
      address: "Test adresi, Adapazarı, Sakarya",
    },
    lines: [
      {
        productId: "ESCAY-ENTEGRASYON-TEST",
        productName: "ENTEGRASYON TESTİ — SİLİNECEK",
        vatRate: bizimhesap.getDefaultVatRate(),
        quantity: 1,
        grossUnitPrice: 35,
      },
    ],
    shipping: { grossAmount: 149.9, vatRate: bizimhesap.getShippingVatRate() },
  })

  logger.info(`[test-bizimhesap] mode=${conn.mode} dryRun=${conn.dryRun} total=${total}`)
  logger.info(
    JSON.stringify({ ...payload, firmId: payload.firmId ? "<dolu>" : "<boş>" }, null, 2)
  )

  if (process.env.BIZIMHESAP_TEST_SEND !== "1") {
    logger.info("[test-bizimhesap] İstek atılmadı. Göndermek için: BIZIMHESAP_TEST_SEND=1")
    return
  }
  if (conn.mode === "mock") {
    throw new Error("BIZIMHESAP_FIRM_ID boş — gönderilecek hesap yok.")
  }

  try {
    const result = await bizimhesap.addInvoice(payload)
    logger.warn(
      `[test-bizimhesap] GERÇEK kayıt açıldı, panelden silin: no=${payload.invoiceNo} guid=${result.guid} url=${result.url || "-"}`
    )
  } catch (err) {
    if (err instanceof BizimhesapError) {
      logger.error(
        `[test-bizimhesap] ${err.rejected ? "Reddedildi" : "Sonuç belirsiz, paneli kontrol edin"}: ${err.message}`
      )
    }
    throw err
  }
}
