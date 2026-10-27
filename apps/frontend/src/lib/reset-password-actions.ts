"use server"

import { FetchError } from "@medusajs/js-sdk"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  authPasswordTooShortMessage,
} from "./auth/constants"
import { sdk } from "./medusa"

export type ResetPasswordResult =
  | { ok: true }
  | {
      ok: false
      message: string
      code?: "expired" | "invalid" | "validation"
    }

export type RequestResetResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

function errMessage(e: unknown, fallback: string) {
  if (e instanceof FetchError) {
    return e.message.trim() || fallback
  }
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === "string" && m.trim()) return m
  }
  return fallback
}

function mapUpdateError(e: unknown): ResetPasswordResult {
  const status = e instanceof FetchError ? e.status : undefined
  const message = errMessage(e, "")

  if (
    status === 401 ||
    status === 403 ||
    /invalid|expired|unauthorized|not found/i.test(message)
  ) {
    return {
      ok: false,
      code: "expired",
      message:
        "Bağlantının süresi dolmuş veya geçersiz. Lütfen yeni bir şifre sıfırlama talebi oluşturun.",
    }
  }

  if (status === 400 || /password/i.test(message)) {
    return {
      ok: false,
      code: "validation",
      message: message || authPasswordTooShortMessage(),
    }
  }

  return {
    ok: false,
    code: "invalid",
    message: "Şifre güncellenemedi. Lütfen tekrar deneyin.",
  }
}

export async function resetPasswordAction(input: {
  token: string
  email: string
  password: string
}): Promise<ResetPasswordResult> {
  const token = input.token.trim()
  const email = input.email.trim()
  const password = input.password

  if (!token || !email) {
    return {
      ok: false,
      code: "invalid",
      message: "Geçersiz veya eksik bağlantı.",
    }
  }

  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      code: "validation",
      message: authPasswordTooShortMessage(),
    }
  }

  try {
    await sdk.auth.updateProvider(
      "customer",
      "emailpass",
      { email, password },
      token
    )
    return { ok: true }
  } catch (e) {
    return mapUpdateError(e)
  }
}

export async function requestPasswordResetAction(
  email: string
): Promise<RequestResetResult> {
  const identifier = email.trim()
  if (!identifier || !identifier.includes("@")) {
    return { ok: false, message: "Geçerli bir e-posta adresi gerekli." }
  }

  try {
    await sdk.auth.resetPassword("customer", "emailpass", { identifier })
  } catch {
    /* anti-enumeration */
  }

  return {
    ok: true,
    message:
      "Eğer bu e-posta kayıtlıysa, şifre sıfırlama bağlantısı gönderildi.",
  }
}
