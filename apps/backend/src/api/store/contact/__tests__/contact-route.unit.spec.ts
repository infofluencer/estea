import { POST } from "../route"

function run(body: Record<string, unknown>) {
  const sent: { to: string; content: { subject: string; html: string; text: string } }[] = []
  const req = {
    body,
    scope: {
      resolve: () => ({
        createNotifications: async (data: (typeof sent)[number]) => {
          sent.push(data)
        },
      }),
    },
  }
  let json: unknown
  const res = { status: () => ({ json: (v: unknown) => (json = v) }) }
  return POST(req as never, res as never).then(() => ({ sent, json }))
}

const valid = {
  name: "Ayşe <b>Yılmaz</b>",
  email: "ayse@example.com",
  subject: "Toptan & perakende",
  message: "<script>alert(1)</script>\nFiyat listesi rica ederim.",
}

describe("POST /store/contact", () => {
  it("kullanıcı girdisi HTML'de kaçışlı, satır sonu <br>", async () => {
    const { sent, json } = await run(valid)
    expect(json).toEqual({ ok: true })
    expect(sent).toHaveLength(1)
    const { html, subject, text } = sent[0].content
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<b>Yılmaz</b>")
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;<br>Fiyat")
    expect(html).toContain("Toptan &amp; perakende")
    expect(subject).toEqual("[Es Çay İletişim] Toptan & perakende")
    expect(text).toContain("<script>")
  })

  it("konu 120 karakterde kesilir", async () => {
    const { sent } = await run({ ...valid, subject: "a".repeat(300) })
    expect(sent[0].content.subject).toEqual(`[Es Çay İletişim] ${"a".repeat(120)}`)
  })

  it("bal tuzağı dolu → ok döner, mail gitmez", async () => {
    const { sent, json } = await run({ ...valid, company: "Bot" })
    expect(json).toEqual({ ok: true })
    expect(sent).toHaveLength(0)
  })

  it("doğrulayıcı atlanırsa bile kısa mesaj reddedilir", async () => {
    await expect(run({ ...valid, message: "kısa" })).rejects.toThrow(/Invalid contact payload/)
  })
})
