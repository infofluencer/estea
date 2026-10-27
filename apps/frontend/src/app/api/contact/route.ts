import { NextRequest, NextResponse } from "next/server"
import { backendUrl } from "@/lib/medusa"

const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 12
const hits = new Map<string, number[]>()

function clientKey(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for")
  return forwarded?.split(",")[0]?.trim() || "unknown"
}

function rateLimited(key: string): boolean {
  const now = Date.now()
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_ATTEMPTS) {
    hits.set(key, recent)
    return true
  }
  recent.push(now)
  hits.set(key, recent)
  return false
}

export async function POST(req: NextRequest) {
  if (rateLimited(clientKey(req))) {
    return NextResponse.json(
      { ok: false, message: "Çok fazla istek. Lütfen sonra tekrar deneyin." },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json(
      { ok: false, message: "Geçersiz istek." },
      { status: 400 }
    )
  }

  // Honeypot — bots fill this; humans leave empty.
  if (typeof body.company === "string" && body.company.trim()) {
    return NextResponse.json({ ok: true })
  }

  const name = String(body.name || "").trim()
  const email = String(body.email || "").trim()
  const subject = String(body.subject || "").trim()
  const message = String(body.message || "").trim()

  if (
    name.length < 2 ||
    !email.includes("@") ||
    subject.length < 2 ||
    message.length < 10
  ) {
    return NextResponse.json(
      { ok: false, message: "Lütfen tüm alanları geçerli şekilde doldurun." },
      { status: 400 }
    )
  }

  try {
    const publishableKey = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
    const res = await fetch(`${backendUrl()}/store/contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(publishableKey
          ? { "x-publishable-api-key": publishableKey }
          : {}),
      },
      body: JSON.stringify({ name, email, subject, message, company: "" }),
    })

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.",
        },
        { status: 502 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin.",
      },
      { status: 502 }
    )
  }
}
