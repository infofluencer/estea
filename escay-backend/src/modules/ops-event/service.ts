import { MedusaService } from "@medusajs/framework/utils"
import OpsEvent from "./models/ops-event"

class OpsEventModuleService extends MedusaService({
  OpsEvent,
}) {}

export default OpsEventModuleService
