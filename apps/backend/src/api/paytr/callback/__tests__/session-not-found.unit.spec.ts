jest.mock("@medusajs/medusa/core-flows", () => ({ processPaymentWorkflow: jest.fn() }))
jest.mock("../../../../lib/ops-events", () => ({ recordOpsEvent: jest.fn() }))
jest.mock("../../../../lib/paytr-compensate", () => ({
  compensatePaytrCharge: jest.fn(),
  sendPaytrCriticalAlert: jest.fn(async () => undefined),
}))
jest.mock("../../../../modules/paytr/hash", () => ({
  callbackAmountMatchesSession: jest.fn(() => true),
  verifyCallbackHash: jest.fn(() => true),
}))
jest.mock("../../../../modules/paytr/mock-iade", () => ({ isPaytrMockEnabled: jest.fn(() => true) }))
jest.mock("../../../../modules/paytr/order-guards", () => ({
  findOrderIdForPaymentSession: jest.fn(),
  findPaymentSessionByMerchantOid: jest.fn(async () => null),
  markCallbackProcessed: jest.fn(),
  markPaytrSessionPaid: jest.fn(),
  paytrCallbackLockKey: (oid: string) => `paytr:${oid}`,
  recordFailedAttempt: jest.fn(),
  resolveLocking: () => ({
    execute: async (_key: unknown, job: () => Promise<unknown>) => job(),
  }),
  resolvePaymentModule: jest.fn(),
  retrieveOrderForCancelGuard: jest.fn(),
}))

jest.mock("../../../../lib/paytr-checkout", () => ({
  ensureCheckoutForSession: jest.fn(),
  findPaytrCheckout: jest.fn(async () => null),
  recordPaytrCheckoutFailure: jest.fn(),
  settlePaytrCheckout: jest.fn(),
}))

import { sendPaytrCriticalAlert } from "../../../../lib/paytr-compensate"
import { POST } from "../route"

async function callback(status: string) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const locking = { execute: async (_key: unknown, job: () => Promise<unknown>) => job() }
  const req = {
    body: { merchant_oid: "Mpayses123abc", status, total_amount: "12345", hash: "h" },
    scope: { resolve: (name: string) => (name === "logger" ? logger : locking) },
  }
  const res = { status: jest.fn().mockReturnThis(), send: jest.fn() }
  await POST(req as never, res as never)
  return res
}

describe("PayTR callback: ödeme oturumu bulunamadı", () => {
  beforeEach(() => jest.clearAllMocks())

  it("success → kritik uyarı, PayTR'ye OK", async () => {
    const res = await callback("success")
    expect(sendPaytrCriticalAlert).toHaveBeenCalledTimes(1)
    expect(sendPaytrCriticalAlert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        kind: "session_not_found",
        merchantOid: "Mpayses123abc",
        callbackAmountKurus: "12345",
      })
    )
    expect(res.send).toHaveBeenCalledWith("OK")
  })

  it("failed → para alınmadı, uyarı yok", async () => {
    const res = await callback("failed")
    expect(sendPaytrCriticalAlert).not.toHaveBeenCalled()
    expect(res.send).toHaveBeenCalledWith("OK")
  })
})
