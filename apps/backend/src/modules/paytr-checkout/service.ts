import { MedusaService } from "@medusajs/framework/utils"
import PaytrCheckout from "./models/paytr-checkout"

class PaytrCheckoutModuleService extends MedusaService({
  PaytrCheckout,
}) {}

export default PaytrCheckoutModuleService
