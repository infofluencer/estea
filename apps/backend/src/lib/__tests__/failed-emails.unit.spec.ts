import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { findUnresolvedEmails, processFailedEmails, type NotificationRow } from "../failed-emails"
import { sendOrderConfirmationEmail } from "../order-confirmation-email"
import { dailyTitle, recordOpsEvent } from "../ops-events"

jest.mock("../order-confirmation-email", () => ({
  sendOrderConfirmationEmail: jest.fn(),
}))
jest.mock("../ops-events", () => ({
  ...jest.requireActual("../ops-events"),
  recordOpsEvent: jest.fn().mockResolvedValue(undefined),
}))

const send = sendOrderConfirmationEmail as jest.Mock
const record = recordOpsEvent as jest.Mock

function row(id: string, status: string, key?: string, extra: Partial<NotificationRow> = {}): NotificationRow {
  return { id, status, idempotency_key: key, template: "order-confirmation", resource_id: "order_1", ...extra }
}

describe("findUnresolvedEmails", () => {
  it("başarısız maili bulur", () => {
    expect(findUnresolvedEmails([row("1", "failure", "k")])).toEqual([
      { template: "order-confirmation", resourceId: "order_1", attempts: 1 },
    ])
  })

  it("denemeleri tek mailde toplar", () => {
    const [email] = findUnresolvedEmails([
      row("1", "failure", "k"),
      row("2", "failure", "k#r1"),
      row("3", "failure", "k#r2"),
    ])
    expect(email.attempts).toBe(3)
  })

  it("sonraki deneme başarılıysa çözülmüş sayar", () => {
    expect(findUnresolvedEmails([row("1", "failure", "k"), row("2", "success", "k#r1")])).toEqual([])
  })

  it("gönderilmekte olanı başarısız saymaz", () => {
    expect(findUnresolvedEmails([row("1", "pending", "k")])).toEqual([])
  })

  it("anahtarsız mailleri birbirine karıştırmaz", () => {
    expect(findUnresolvedEmails([row("1", "failure"), row("2", "failure")])).toHaveLength(2)
  })

  it("farklı anahtarları ayrı tutar", () => {
    expect(findUnresolvedEmails([row("1", "failure", "a"), row("2", "success", "b")])).toHaveLength(1)
  })
})

describe("processFailedEmails", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  const container = (rows: NotificationRow[]) =>
    ({
      resolve: (key: string) =>
        key === ContainerRegistrationKeys.LOGGER
          ? logger
          : key === Modules.NOTIFICATION
            ? { listNotifications: async () => rows }
            : undefined,
    }) as never

  beforeEach(() => jest.clearAllMocks())

  it("gönderilen maili kurtarılmış sayar", async () => {
    send.mockResolvedValue({ sent: true })

    await expect(processFailedEmails(container([row("1", "failure", "k")]))).resolves.toEqual({
      retried: 1,
      recovered: 1,
      unresolved: 0,
    })
    expect(record).not.toHaveBeenCalled()
  })

  it("iptal siparişi kurtarılmış saymaz, uyarmaz", async () => {
    send.mockResolvedValue({ sent: false, skipped: "canceled" })

    await expect(processFailedEmails(container([row("1", "failure", "k")]))).resolves.toEqual({
      retried: 0,
      recovered: 0,
      unresolved: 0,
    })
    expect(record).not.toHaveBeenCalled()
  })

  it("e-postası olmayan siparişi kurtarılmış saymaz, uyarır", async () => {
    send.mockResolvedValue({ sent: false, skipped: "no_email" })

    await expect(processFailedEmails(container([row("1", "failure", "k")]))).resolves.toMatchObject({
      recovered: 0,
      unresolved: 1,
    })
    expect(record).toHaveBeenCalledTimes(1)
  })

  it("sipariş onayı dışındaki maili tekrar denemez, uyarır", async () => {
    const rows = [row("1", "failure", "k", { template: "password-reset", resource_id: null })]

    await expect(processFailedEmails(container(rows))).resolves.toMatchObject({ retried: 0, unresolved: 1 })
    expect(send).not.toHaveBeenCalled()
    expect(record.mock.calls[0][1].title).toContain("password-reset")
  })

  it("deneme sınırına gelen maili bırakır", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => row(String(i), "failure", i ? `k#r${i}` : "k"))

    await expect(processFailedEmails(container(rows))).resolves.toMatchObject({ retried: 0, unresolved: 1 })
    expect(send).not.toHaveBeenCalled()
  })
})

describe("dailyTitle", () => {
  it("aynı liste sıradan bağımsız aynı başlığı verir", () => {
    expect(dailyTitle("T", ["a", "b"])).toBe(dailyTitle("T", ["b", "a"]))
  })

  it("liste değişince başlık değişir", () => {
    expect(dailyTitle("T", ["a"])).not.toBe(dailyTitle("T", ["a", "b"]))
  })
})
