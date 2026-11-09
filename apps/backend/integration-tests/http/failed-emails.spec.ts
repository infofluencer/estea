import { createServer, type Server } from "net"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { processFailedEmails } from "../../src/lib/failed-emails"
import { OPS_EVENT_MODULE } from "../../src/modules/ops-event"
import { placeGuestStubOrder } from "./helpers/place-order"
import {
  createPricedProducts,
  seedStorefrontFixture,
} from "./helpers/storefront-fixture"

jest.setTimeout(120 * 1000)

const SMTP_PORT = 12525
// medusa-config modül seçeneklerini runner'ın `env`'inden önce okuyor.
process.env.SMTP_HOST = "127.0.0.1"
process.env.SMTP_PORT = String(SMTP_PORT)
process.env.SMTP_USER = ""
process.env.SMTP_PASS = ""
process.env.SMTP_SECURE = "false"
process.env.SMTP_FROM = "Es Çay <test@example.com>"

/** Gerçek nodemailer'ın konuştuğu en küçük SMTP sunucusu; `rejecting` iken alıcıyı reddeder. */
function startSmtp() {
  const state = { rejecting: false, accepted: 0 }
  const server: Server = createServer((socket) => {
    let inData = false
    socket.write("220 test\r\n")
    socket.on("data", (chunk) => {
      const text = chunk.toString()
      if (inData) {
        if (text.endsWith("\r\n.\r\n")) {
          inData = false
          state.accepted++
          socket.write("250 ok\r\n")
        }
        return
      }
      const command = text.slice(0, 4).toUpperCase()
      if (command === "DATA") {
        inData = true
        socket.write("354 go\r\n")
      } else if (command === "RCPT" && state.rejecting) {
        socket.write("550 reddedildi\r\n")
      } else if (command === "QUIT") {
        socket.end("221 bye\r\n")
      } else {
        socket.write("250 ok\r\n")
      }
    })
    socket.on("error", () => undefined)
  })
  return { state, server }
}

medusaIntegrationTestRunner({
  inApp: true,
  env: {
    PAYTR_MOCK: "1",
    PAYTR_MERCHANT_ID: "",
    PAYTR_MERCHANT_KEY: "",
    PAYTR_MERCHANT_SALT: "",
    SHIPPING_CARRIER: "",
    COOKIE_SECURE: "false",
    BIZIMHESAP_FIRM_ID: "",
  },
  testSuite: ({ api, getContainer }) => {
    describe("Gönderilemeyen mailler (gerçek nodemailer, sahte SMTP)", () => {
      const smtp = startSmtp()

      beforeAll((done) => {
        smtp.server.listen(SMTP_PORT, "127.0.0.1", done)
      })

      afterAll((done) => {
        smtp.server.close(() => done())
      })

      it("sipariş onayı kesinti boyunca uyarır, sunucu dönünce tek kez gider", async () => {
        const container = getContainer()
        const fx = await seedStorefrontFixture(container)
        const [product] = await createPricedProducts(container, fx, 1)
        const order = await placeGuestStubOrder(
          api,
          fx,
          product.variants[0].id,
          "mail@example.com"
        )

        const notification = container.resolve(Modules.NOTIFICATION)
        const key = `order-confirmation:${order.id}`
        const rows = () =>
          notification.listNotifications({ resource_id: order.id, channel: "email" } as never, {
            take: 50,
          })

        smtp.state.rejecting = true
        await expect(
          notification.createNotifications({
            to: "mail@example.com",
            channel: "email",
            template: "order-confirmation",
            content: { subject: "Onay", text: "x" },
            resource_id: order.id,
            resource_type: "order",
            idempotency_key: key,
          })
        ).rejects.toThrow("550")

        // Kesinti sürüyor: yeni deneme başarısız, uyarı düşer.
        await expect(processFailedEmails(container)).resolves.toMatchObject({
          retried: 1,
          recovered: 0,
          unresolved: 1,
        })
        expect(await rows()).toHaveLength(2)
        const ops = container.resolve(OPS_EVENT_MODULE) as {
          listOpsEvents: (f: Record<string, unknown>) => Promise<{ title: string }[]>
        }
        const events = await ops.listOpsEvents({ kind: "mail.failed" })
        expect(events[0].title).toContain("order-confirmation")

        // Sunucu döndü: mail gider.
        smtp.state.rejecting = false
        await expect(processFailedEmails(container)).resolves.toMatchObject({
          retried: 1,
          recovered: 1,
          unresolved: 0,
        })
        expect(smtp.state.accepted).toBe(1)

        // Çözülmüş mail bir daha gönderilmez.
        await expect(processFailedEmails(container)).resolves.toMatchObject({ retried: 0 })
        expect(smtp.state.accepted).toBe(1)
      })
    })
  },
})
