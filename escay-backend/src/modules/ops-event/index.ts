import OpsEventModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const OPS_EVENT_MODULE = "ops_event"

export default Module(OPS_EVENT_MODULE, {
  service: OpsEventModuleService,
})
