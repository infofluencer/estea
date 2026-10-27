import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CarrierFulfillmentProviderService from "./service"

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [CarrierFulfillmentProviderService],
})
