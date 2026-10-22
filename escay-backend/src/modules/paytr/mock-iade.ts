/**
 * PayTR /odeme/iade mock — PAYTR_MOCK=1 iken gerçek HTTP yerine kullanılır.
 * Testler yakalanan body'yi assert eder; yanıt success/fail/network olarak ayarlanır.
 */

export type PaytrIadeCapturedRequest = {
  merchant_id: string
  merchant_oid: string
  return_amount: string
  paytr_token: string
  reference_no: string
  url: string
  at: string
}

export type PaytrIadeMockMode = "success" | "fail" | "network_error" | "invalid_json"

type MockState = {
  mode: PaytrIadeMockMode
  requests: PaytrIadeCapturedRequest[]
  failMessage: string
  failErrNo: string
}

const state: MockState = {
  mode: "success",
  requests: [],
  failMessage: "Mock PayTR iade hatasi",
  failErrNo: "009",
}

export function resetPaytrIadeMock(mode: PaytrIadeMockMode = "success") {
  state.mode = mode
  state.requests = []
  state.failMessage = "Mock PayTR iade hatasi"
  state.failErrNo = "009"
}

export function setPaytrIadeMockMode(mode: PaytrIadeMockMode) {
  state.mode = mode
}

export function setPaytrIadeMockFail(
  errNo: string,
  errMsg: string
) {
  state.mode = "fail"
  state.failErrNo = errNo
  state.failMessage = errMsg
}

export function getPaytrIadeMockRequests(): PaytrIadeCapturedRequest[] {
  return [...state.requests]
}

export function getLastPaytrIadeMockRequest(): PaytrIadeCapturedRequest | null {
  return state.requests[state.requests.length - 1] ?? null
}

export function isPaytrMockEnabled(): boolean {
  return process.env.PAYTR_MOCK === "1" || process.env.PAYTR_MOCK === "true"
}

/** Multipart form buffer'dan alanları çıkar (form-data paketi). */
export function parsePaytrFormBody(body: Buffer | string): Record<string, string> {
  const raw = typeof body === "string" ? body : body.toString("utf8")
  const fields: Record<string, string> = {}
  // multipart: name="field"\r\n\r\nvalue
  const re =
    /Content-Disposition:\s*form-data;\s*name="([^"]+)"\r?\n\r?\n([\s\S]*?)(?=\r?\n------|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    fields[m[1]] = m[2].replace(/\r?\n$/, "")
  }
  // fallback: urlencoded
  if (!Object.keys(fields).length && raw.includes("=")) {
    for (const part of raw.split("&")) {
      const [k, v] = part.split("=")
      if (k) fields[decodeURIComponent(k)] = decodeURIComponent(v || "")
    }
  }
  return fields
}

export async function mockPaytrIadeFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const body = init?.body
  let fields: Record<string, string> = {}
  if (Buffer.isBuffer(body)) {
    fields = parsePaytrFormBody(body)
  } else if (typeof body === "string") {
    fields = parsePaytrFormBody(body)
  } else if (body && typeof (body as { toString?: () => string }).toString === "function") {
    fields = parsePaytrFormBody(Buffer.from(String(body)))
  }

  const captured: PaytrIadeCapturedRequest = {
    merchant_id: fields.merchant_id || "",
    merchant_oid: fields.merchant_oid || "",
    return_amount: fields.return_amount || "",
    paytr_token: fields.paytr_token || "",
    reference_no: fields.reference_no || "",
    url,
    at: new Date().toISOString(),
  }
  state.requests.push(captured)

  if (state.mode === "network_error") {
    throw new Error("Mock PayTR network error (ETIMEDOUT)")
  }

  if (state.mode === "invalid_json") {
    return new Response("not-json<<<", {
      status: 200,
      headers: { "content-type": "text/plain" },
    })
  }

  if (state.mode === "fail") {
    return new Response(
      JSON.stringify({
        status: "error",
        err_no: state.failErrNo,
        err_msg: state.failMessage,
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )
  }

  return new Response(
    JSON.stringify({
      status: "success",
      merchant_oid: captured.merchant_oid,
      return_amount: captured.return_amount,
      reference_no: captured.reference_no,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}
