import { Module } from "@medusajs/framework/utils"
import PaytrCheckoutModuleService from "./service"

export const PAYTR_CHECKOUT_MODULE = "paytr_checkout"

export default Module(PAYTR_CHECKOUT_MODULE, {
  service: PaytrCheckoutModuleService,
})
