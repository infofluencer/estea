import { assert, assertStatus, section, skip } from "../_helpers/assert"
import type { StagingEnv } from "../_helpers/env"
import { asNumber, asRecord, bodyMessage, rawFetch, storeFetch } from "../_helpers/http"
import net from "net"

async function redisPing(redisUrl: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const u = new URL(redisUrl)
    return await new Promise((resolve) => {
      const socket = net.connect(
        { host: u.hostname, port: Number(u.port || 6379) },
        () => {
          socket.write("PING\r\n")
        }
      )
      socket.setTimeout(3000)
      let buf = ""
      socket.on("data", (d) => {
        buf += d.toString()
        if (buf.includes("+PONG") || buf.startsWith("-")) {
          socket.end()
          resolve({
            ok: buf.includes("+PONG"),
            detail: buf.includes("+PONG") ? "PONG" : buf.trim().slice(0, 80),
          })
        }
      })
      socket.on("error", (e) =>
        resolve({ ok: false, detail: e.message })
      )
      socket.on("timeout", () => {
        socket.destroy()
        resolve({ ok: false, detail: "timeout" })
      })
    })
  } catch (e) {
    return {
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
}

export async function runHealthSuite(env: StagingEnv) {
  section("1. Sağlık & bağlantı")

  const health = await rawFetch(`${env.backendUrl}/health`).catch(() => null)
  assertStatus("Backend /health → 200", health?.status ?? 0, 200)

  const products = await storeFetch(
    env,
    `/store/products?limit=1&fields=id,title`
  )
  assertStatus("Publishable key geçerli (store products)", products.status, 200)
  const count = asNumber(asRecord(products.body).count)
  assert(
    "DB bağlantısı (ürün listesi)",
    products.status === 200 &&
      (count > 0 ||
        Array.isArray(asRecord(products.body).products)),
    products.status === 200 ? `count=${count}` : bodyMessage(products.body)
  )

  const bad = await rawFetch(`${env.backendUrl}/store/products?limit=1`, {
    headers: {
      "content-type": "application/json",
      "x-publishable-api-key": "pk_invalid_staging_smoke",
    },
  })
  assert(
    "Geçersiz publishable key reddedilir",
    bad.status === 400 || bad.status === 401 || bad.status === 403,
    `status=${bad.status}`
  )

  if (env.redisUrl) {
    const ping = await redisPing(env.redisUrl)
    assert("Redis PING (STAGING_REDIS_URL)", ping.ok, ping.detail)
  } else {
    skip(
      "Redis TCP PING",
      "STAGING_REDIS_URL yok — backend ayakta olduğu için dolaylı OK"
    )
    assert(
      "Redis (dolaylı — backend + DB OK)",
      health?.status === 200 && products.status === 200,
      "Doğrudan ping için STAGING_REDIS_URL verin"
    )
  }
}
