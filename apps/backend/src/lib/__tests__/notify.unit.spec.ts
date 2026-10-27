import { createNotificationIdempotent } from "../notify"

function fakeService(existing: { id: string; idempotency_key: string; status: string }[]) {
  const created: Record<string, unknown>[] = []
  return {
    created,
    createNotifications: jest.fn(async (d: Record<string, unknown>) => {
      created.push(d)
      return d
    }),
    listNotifications: jest.fn(async () => existing),
  }
}

const dto = { to: "a@b.c", channel: "email", template: "t", content: { subject: "s" }, idempotency_key: "k:1" }

describe("createNotificationIdempotent", () => {
  it("kayıt yoksa olduğu gibi gönderir", async () => {
    const svc = fakeService([])
    const r = await createNotificationIdempotent(svc as never, dto as never)
    expect(r).toEqual({ sent: true, idempotency_key: "k:1" })
    expect(svc.created[0].idempotency_key).toBe("k:1")
  })

  it("başarılı kayıt varsa göndermez", async () => {
    const svc = fakeService([{ id: "n1", idempotency_key: "k:1", status: "success" }])
    const r = await createNotificationIdempotent(svc as never, dto as never)
    expect(r.sent).toBe(false)
    expect(svc.createNotifications).not.toHaveBeenCalled()
  })

  it("başarısız kayıt varsa yeni anahtarla (#r<n>) gönderir — Medusa 'not found' hatasına düşmez", async () => {
    const svc = fakeService([
      { id: "n1", idempotency_key: "k:1", status: "failure" },
      { id: "n2", idempotency_key: "k:1#r1", status: "failure" },
    ])
    const r = await createNotificationIdempotent(svc as never, dto as never)
    expect(r).toEqual({ sent: true, idempotency_key: "k:1#r2" })
    expect(svc.created[0].idempotency_key).toBe("k:1#r2")
  })

  it("listNotifications olmayan sahte serviste doğrudan gönderir", async () => {
    const createNotifications = jest.fn(async () => ({}))
    await createNotificationIdempotent({ createNotifications } as never, dto as never)
    expect(createNotifications).toHaveBeenCalledWith(dto)
  })
})
