import { sdk } from "../medusa"
import { authHeaders } from "./session"

export async function getLoggedInCustomer() {
  const headers = await authHeaders()
  if (!headers) return null
  try {
    const { customer } = await sdk.store.customer.retrieve(
      { fields: "+addresses" },
      headers
    )
    return customer
  } catch {
    return null
  }
}
