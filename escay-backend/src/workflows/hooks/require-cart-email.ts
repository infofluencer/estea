import { MedusaError } from "@medusajs/framework/utils"
import { completeCartWorkflow } from "@medusajs/medusa/core-flows"
import { isValidEmail } from "../../api/store/orders/_shared"

/**
 * P1: refuse cart completion unless a valid email is present (guest and logged-in).
 * Logged-in carts already copy the customer email; this does not change that path.
 */
completeCartWorkflow.hooks.validate(({ cart }) => {
  const email = typeof cart?.email === "string" ? cart.email : ""
  if (!email.trim()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "email required")
  }
  if (!isValidEmail(email)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Invalid email")
  }
})
