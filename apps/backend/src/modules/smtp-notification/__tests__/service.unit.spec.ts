import nodemailer from "nodemailer"
import SmtpNotificationProviderService from "../service"

jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}))

const createTransport = nodemailer.createTransport as jest.Mock
const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() }
const realNodeEnv = process.env.NODE_ENV

function provider(options: Record<string, unknown>) {
  return new SmtpNotificationProviderService({ logger } as never, options as never)
}

const notification = {
  to: "a@example.com",
  channel: "email",
  template: "t",
  content: { subject: "Konu", html: "<p>x</p>" },
} as never

describe("SmtpNotificationProviderService", () => {
  const sendMail = jest.fn()
  const verify = jest.fn()
  const base = { host: "smtp.example.com", port: 587, from: "Es Çay <a@b.c>" }

  beforeEach(() => {
    jest.clearAllMocks()
    sendMail.mockResolvedValue({ messageId: "m1" })
    verify.mockResolvedValue(true)
    createTransport.mockReturnValue({ sendMail, verify })
  })

  afterEach(() => {
    process.env.NODE_ENV = realNodeEnv
  })

  it("zaman aşımlarıyla bağlanır ve gönderir", async () => {
    const result = await provider({ ...base, user: "u", pass: "gercek-sifre" }).send(notification)

    expect(result).toEqual({ id: "m1" })
    expect(createTransport.mock.calls[0][0]).toMatchObject({
      auth: { user: "u", pass: "gercek-sifre" },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000,
    })
  })

  it("kimliksiz yerel sunucuya (Mailpit) auth'suz bağlanır", () => {
    provider({ ...base, host: "localhost", port: 1025 })
    expect(createTransport.mock.calls[0][0].auth).toBeUndefined()
  })

  it("şablondaki kullanıcı + yer tutucu şifreyle Mailpit'e auth'suz bağlanır", () => {
    provider({ ...base, host: "localhost", port: 1025, user: "u", pass: "your-google-app-password-here" })

    expect(createTransport.mock.calls[0][0].auth).toBeUndefined()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it.each(["", "your-google-app-password-here", "<google app password>"])(
    "yer tutucu şifrede (%s) bağlanmaz, gönderim açık hatayla düşer",
    async (pass) => {
      const service = provider({ ...base, user: "u", pass })

      expect(createTransport).not.toHaveBeenCalled()
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("SMTP_PASS"))
      await expect(service.send(notification)).rejects.toThrow("not configured")
    }
  )

  it("canlıda açılışta sunucuyu doğrular, hata açılışı durdurmaz", async () => {
    process.env.NODE_ENV = "production"
    verify.mockRejectedValue(new Error("Invalid login"))

    provider({ ...base, user: "u", pass: "gercek-sifre" })
    await new Promise((resolve) => setImmediate(resolve))

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Invalid login"))
  })

  it("canlı dışında doğrulama yapmaz", () => {
    provider({ ...base, user: "u", pass: "gercek-sifre" })
    expect(verify).not.toHaveBeenCalled()
  })

  it("gönderim hatasını iletir", async () => {
    sendMail.mockRejectedValue(new Error("550 reddedildi"))
    const service = provider({ ...base, user: "u", pass: "gercek-sifre" })

    await expect(service.send(notification)).rejects.toThrow("550 reddedildi")
  })
})
