import { MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import {
  checkoutInputFromMedusaAddress,
  validateCheckoutAddress,
  type MedusaAddressLike,
} from "@escay/shared/checkout-address"
import { isValidEmail } from "../../api/store/orders/_shared"

/**
 * Sipariş oluşmadan önce sepetin son süzgeci (mağaza formu aynı kuralları önceden çalıştırır;
 * Store API'yi doğrudan çağıran istek buradan geçer):
 *  - P1: e-posta zorunlu ve geçerli (misafir + oturumlu).
 *  - Teslimat adresi: ad, açık adres, resmi il/ilçe, posta kodu, telefon. Mahalle sunucuda
 *    zorunlu değil (test betikleri ve API istemcileri için taban kural).
 *  - Fatura adresi: aynı kurallar + fatura kimliği. Kurumsal → kontrol basamaklı VKN,
 *    vergi dairesi, unvan; bireysel → TCKN varsa kontrol basamağı tutmalı. Yanlış kimlik
 *    BizimHesap'ta düzeltilemez (sorgu / silme yok), o yüzden burada kesilir.
 */
completeCartWorkflow.hooks.validate(({ cart }) => {
  const email = typeof cart?.email === "string" ? cart.email : ""
  if (!email.trim()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "email required")
  }
  if (!isValidEmail(email)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid email")
  }

  const c = cart as {
    shipping_address?: MedusaAddressLike | null
    billing_address?: MedusaAddressLike | null
  }
  if (!c.shipping_address) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Teslimat adresi zorunlu.")
  }
  const shipping = validateCheckoutAddress(
    checkoutInputFromMedusaAddress(c.shipping_address),
    { requireNeighbourhood: false }
  )
  if (!shipping.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Teslimat adresi: ${shipping.message}`
    )
  }

  // Fatura kimliği billing metadata'sında; billing yoksa Medusa shipping'i kullanır.
  const billingAddr = c.billing_address || c.shipping_address
  const billing = validateCheckoutAddress(
    checkoutInputFromMedusaAddress(billingAddr, { withInvoiceIdentity: true }),
    { requireNeighbourhood: false, requireDistrict: false }
  )
  if (!billing.ok) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `Fatura adresi: ${billing.message}`
    )
  }
})
