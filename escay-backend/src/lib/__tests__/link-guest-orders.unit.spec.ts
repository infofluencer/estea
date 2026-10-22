import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  linkGuestOrdersToRegisteredCustomer,
  normalizeCustomerEmail,
} from "../link-guest-orders"

function mockContainer(deps: {
  customers: { listCustomers: jest.Mock }
  orders: { listOrders: jest.Mock; updateOrders: jest.Mock }
  logger?: { info: jest.Mock; warn: jest.Mock; error: jest.Mock }
  query?: { graph: jest.Mock }
}) {
  const logger = deps.logger || {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }
  return {
    resolve: (key: string) => {
      if (key === ContainerRegistrationKeys.LOGGER) return logger
      if (key === Modules.CUSTOMER) return deps.customers
      if (key === Modules.ORDER) return deps.orders
      if (key === ContainerRegistrationKeys.QUERY) return deps.query
      throw new Error(`unexpected resolve ${key}`)
    },
  }
}

describe("linkGuestOrdersToRegisteredCustomer", () => {
  const guest = {
    id: "cus_guest",
    email: "Same@Escay.test",
    has_account: false,
  }
  const registered = {
    id: "cus_reg",
    email: "same@escay.test",
    has_account: true,
  }
  const order = {
    id: "order_1",
    email: "same@escay.test",
    customer_id: "cus_guest",
  }

  it("refuses to link without a verified email (customer.email is not trusted)", async () => {
    const updateOrders = jest.fn()
    const listCustomers = jest.fn()
    const container = mockContainer({
      customers: { listCustomers },
      orders: { listOrders: jest.fn(), updateOrders },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id }
    )

    expect(result.skippedReason).toBe("verified_email_required")
    expect(listCustomers).not.toHaveBeenCalled()
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("normalizes email", () => {
    expect(normalizeCustomerEmail("  A@B.C  ")).toBe("a@b.c")
    expect(normalizeCustomerEmail(null)).toBe("")
  })

  it("moves same-email guest orders onto the registered customer", async () => {
    const updateOrders = jest.fn().mockResolvedValue([])
    const container = mockContainer({
      customers: {
        listCustomers: jest
          .fn()
          .mockResolvedValueOnce([registered])
          .mockResolvedValueOnce([guest, registered]),
      },
      orders: {
        listOrders: jest.fn().mockResolvedValue([order]),
        updateOrders,
      },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id, email: "same@escay.test" }
    )

    expect(result.linkedOrderIds).toEqual(["order_1"])
    expect(result.guestCustomerId).toBe("cus_guest")
    expect(updateOrders).toHaveBeenCalledWith([
      { id: "order_1", customer_id: "cus_reg" },
    ])
  })

  it("is idempotent when orders are already on the registered customer", async () => {
    const updateOrders = jest.fn()
    const container = mockContainer({
      customers: {
        listCustomers: jest
          .fn()
          .mockResolvedValueOnce([registered])
          .mockResolvedValueOnce([guest, registered]),
      },
      orders: {
        listOrders: jest.fn().mockResolvedValue([
          { ...order, customer_id: registered.id },
        ]),
        updateOrders,
      },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id, email: "same@escay.test" }
    )

    expect(result.linkedOrderIds).toEqual([])
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("refuses to link when input email does not match the registered customer", async () => {
    const updateOrders = jest.fn()
    const container = mockContainer({
      customers: {
        listCustomers: jest.fn().mockResolvedValueOnce([registered]),
      },
      orders: {
        listOrders: jest.fn(),
        updateOrders,
      },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id, email: "other@escay.test" }
    )

    expect(result.skippedReason).toBe("email_mismatch")
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("skips orders whose stored email does not match", async () => {
    const updateOrders = jest.fn()
    const container = mockContainer({
      customers: {
        listCustomers: jest
          .fn()
          .mockResolvedValueOnce([registered])
          .mockResolvedValueOnce([guest, registered]),
      },
      orders: {
        listOrders: jest.fn().mockResolvedValue([
          { ...order, email: "other@escay.test" },
        ]),
        updateOrders,
      },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id, email: "same@escay.test" }
    )

    expect(result.linkedOrderIds).toEqual([])
    expect(updateOrders).not.toHaveBeenCalled()
  })

  it("does not delete the guest customer and no-ops without a guest", async () => {
    const updateOrders = jest.fn()
    const listCustomers = jest
      .fn()
      .mockResolvedValueOnce([registered])
      .mockResolvedValueOnce([registered])
    const container = mockContainer({
      customers: { listCustomers },
      orders: {
        listOrders: jest.fn(),
        updateOrders,
      },
    })

    const result = await linkGuestOrdersToRegisteredCustomer(
      container as never,
      { registeredCustomerId: registered.id, email: "same@escay.test" }
    )

    expect(result.skippedReason).toBe("no_guest_customer")
    expect(updateOrders).not.toHaveBeenCalled()
  })
})
