"use server"

import { redirect } from "next/navigation"
import { transferCartToCustomer } from "../cart"
import { sdk } from "../medusa"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  authPasswordTooShortMessage,
} from "./constants"
import { errMessage } from "./errors"
import {
  clearAuthToken,
  clearVerifyToken,
  getVerifyToken,
  setAuthToken,
  setVerifyToken,
} from "./session"

export type ActionResult =
  | { ok: true; message?: string; logged_in?: boolean }
  | {
      ok: false
      message: string
      code?: "unverified" | "validation" | "email_domain"
      email?: string
    }

export type RegisterResult =
  | { ok: true; needs_verification: true; email: string; message: string }
  | { ok: true }
  | {
      ok: false
      message: string
      code?: "unverified" | "validation" | "email_domain"
      email?: string
    }

async function attachSessionCart(token: string) {
  await transferCartToCustomer(token)
}

async function requestVerificationMail(email: string, actorlessToken: string) {
  await sdk.auth.verification.request(
    {
      entity_id: email,
      entity_type: "email",
      code_provider: "token",
    },
    { Authorization: `Bearer ${actorlessToken}` }
  )
}

type MailRequestResult =
  | { ok: true }
  | { ok: false; rateLimited: boolean; message: string }

async function tryRequestVerificationMail(
  email: string,
  actorlessToken: string
): Promise<MailRequestResult> {
  try {
    await requestVerificationMail(email, actorlessToken)
    return { ok: true }
  } catch (e) {
    const message = errMessage(e, "")
    const rateLimited = /rate_limit|too many|çok fazla|429/i.test(message)
    return {
      ok: false,
      rateLimited,
      message: rateLimited
        ? "Çok fazla doğrulama talebi. Lütfen birkaç dakika sonra “Tekrar gönder” ile deneyin."
        : message ||
          "Doğrulama maili gönderilemedi. “Tekrar gönder” ile tekrar deneyin.",
    }
  }
}

function unverifiedMessage(mail: MailRequestResult): string {
  if (mail.ok) {
    return "Hesabınız doğrulanmamış. Yeni doğrulama bağlantısı e-postanıza gönderildi."
  }
  return mail.message
}

function registerPendingMessage(mail: MailRequestResult): string {
  if (mail.ok) {
    return "Kaydınız alındı. E-postanıza gönderilen doğrulama bağlantısına tıklayın."
  }
  return mail.rateLimited
    ? "Kaydınız alındı, ancak çok fazla doğrulama talebi var. Birkaç dakika sonra “Tekrar gönder”e basın."
    : "Kaydınız alındı. Doğrulama maili gönderilemedi; lütfen “Tekrar gönder” ile deneyin."
}

function isVerificationRequired(
  result: unknown
): result is { verification_required: true; token: string } {
  return (
    !!result &&
    typeof result === "object" &&
    "verification_required" in result &&
    (result as { verification_required?: boolean }).verification_required ===
      true &&
    typeof (result as { token?: unknown }).token === "string"
  )
}

/** Shared login — checkout panel and slide-in panel both use this. */
export async function loginAction(
  email: string,
  password: string
): Promise<ActionResult> {
  const normalizedEmail = email.trim()
  try {
    const result = await sdk.auth.login("customer", "emailpass", {
      email: normalizedEmail,
      password,
    })

    if (isVerificationRequired(result)) {
      await setVerifyToken(result.token)
      const mail = await tryRequestVerificationMail(
        normalizedEmail,
        result.token
      )
      try {
        await sdk.auth.logout()
      } catch {
        /* ignore — clears in-memory SDK token only */
      }
      return {
        ok: false,
        code: "unverified",
        email: normalizedEmail,
        message: unverifiedMessage(mail),
      }
    }

    const token = typeof result === "string" ? result : null
    if (!token) {
      return { ok: false, message: "Giriş başarısız (beklenmeyen yanıt)." }
    }
    await setAuthToken(token)
    await attachSessionCart(token)
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      message: errMessage(e, "E-posta veya şifre hatalı."),
    }
  }
}

export async function logoutAction() {
  await clearAuthToken()
  await clearVerifyToken()
  redirect("/")
}

export async function registerAction(input: {
  first_name: string
  last_name: string
  email: string
  password: string
  password_confirm: string
}): Promise<RegisterResult> {
  const first_name = input.first_name.trim()
  const last_name = input.last_name.trim()
  const email = input.email.trim()
  const password = input.password
  const password_confirm = input.password_confirm

  if (!email || !email.includes("@")) {
    return { ok: false, message: "Geçerli bir e-posta girin." }
  }
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    return { ok: false, message: authPasswordTooShortMessage() }
  }
  if (password !== password_confirm) {
    return { ok: false, message: "Şifreler eşleşmiyor." }
  }

  try {
    const registerResult = await sdk.auth.register("customer", "emailpass", {
      email,
      password,
    })
    const registerToken =
      typeof registerResult === "string" ? registerResult : null
    if (!registerToken) {
      return { ok: false, message: "Kayıt başarısız (beklenmeyen yanıt)." }
    }

    await sdk.store.customer.create(
      {
        email,
        ...(first_name ? { first_name } : {}),
        ...(last_name ? { last_name } : {}),
      },
      {},
      { Authorization: `Bearer ${registerToken}` }
    )
  } catch (e) {
    const message = errMessage(e, "")
    if (/already|exists|duplicate|identity/i.test(message)) {
      return {
        ok: false,
        message: "Bu e-posta ile zaten bir hesap var. Giriş yapın.",
      }
    }
    return {
      ok: false,
      message: message || "Kayıt oluşturulamadı. Lütfen tekrar deneyin.",
    }
  }

  // Strict model: do not issue a full customer session until email is verified.
  try {
    const loginResult = await sdk.auth.login("customer", "emailpass", {
      email,
      password,
    })

    if (isVerificationRequired(loginResult)) {
      await setVerifyToken(loginResult.token)
      const mail = await tryRequestVerificationMail(email, loginResult.token)
      try {
        await sdk.auth.logout()
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        needs_verification: true,
        email,
        message: registerPendingMessage(mail),
      }
    }

    // Edge case: verification already satisfied (shouldn't happen for new regs)
    const token = typeof loginResult === "string" ? loginResult : null
    if (token) {
      await setAuthToken(token)
      await attachSessionCart(token)
      return { ok: true }
    }
  } catch (e) {
    return {
      ok: false,
      message: errMessage(
        e,
        "Hesap oluşturuldu ancak doğrulama maili gönderilemedi. Giriş deneyerek tekrar gönderin."
      ),
    }
  }

  return {
    ok: true,
    needs_verification: true,
    email,
    message:
      "Kaydınız alındı. E-postanıza gönderilen doğrulama bağlantısına tıklayın.",
  }
}

/**
 * Resend verification email using the short-lived actorless verify cookie,
 * or by re-authenticating with email+password when the cookie is missing.
 */
export async function resendVerificationAction(input?: {
  email?: string
  password?: string
}): Promise<ActionResult> {
  const email = input?.email?.trim()
  const password = input?.password

  try {
    let actorlessToken = await getVerifyToken()

    if (!actorlessToken && email && password) {
      const loginResult = await sdk.auth.login("customer", "emailpass", {
        email,
        password,
      })
      if (isVerificationRequired(loginResult)) {
        actorlessToken = loginResult.token
        await setVerifyToken(actorlessToken)
      } else if (typeof loginResult === "string") {
        // Already verified — just log them in
        await setAuthToken(loginResult)
        await attachSessionCart(loginResult)
        return { ok: true, message: "Hesabınız zaten doğrulanmış." }
      }
    }

    if (!actorlessToken || !email) {
      return {
        ok: false,
        message:
          "Doğrulama maili gönderilemedi. Lütfen e-posta ve şifrenizle giriş deneyin.",
      }
    }

    await requestVerificationMail(email, actorlessToken)
    return {
      ok: true,
      message:
        "Yeni doğrulama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.",
    }
  } catch (e) {
    const message = errMessage(e, "")
    if (/rate_limit|too many|çok fazla/i.test(message)) {
      return {
        ok: false,
        message:
          "Çok fazla doğrulama talebi. Lütfen birkaç dakika sonra tekrar deneyin.",
      }
    }
    return {
      ok: false,
      message: message || "Doğrulama maili gönderilemedi. Lütfen tekrar deneyin.",
    }
  }
}

export async function confirmEmailVerificationAction(
  token: string
): Promise<ActionResult> {
  const code = token.trim()
  if (!code) {
    return {
      ok: false,
      message: "Geçersiz veya eksik doğrulama bağlantısı.",
    }
  }

  const verifyJwt = await getVerifyToken()
  const authHeader = verifyJwt
    ? { Authorization: `Bearer ${verifyJwt}` }
    : undefined

  try {
    await sdk.auth.verification.confirm(
      { code, code_provider: "token" },
      authHeader
    )
  } catch (e) {
    const message = errMessage(e, "")
    if (/expired|süresi/i.test(message)) {
      return {
        ok: false,
        code: "validation",
        message:
          "Bağlantının süresi dolmuş. Lütfen yeni bir doğrulama bağlantısı isteyin.",
      }
    }
    if (/invalid|already|not allowed|kullanıl/i.test(message)) {
      return {
        ok: false,
        code: "validation",
        message:
          "Bağlantı geçersiz veya daha önce kullanılmış. Lütfen yeni bir doğrulama bağlantısı isteyin.",
      }
    }
    return {
      ok: false,
      message: message || "Doğrulama başarısız. Lütfen tekrar deneyin.",
    }
  }

  // Same-browser flow: actorless verify JWT → full customer session after confirm.
  if (verifyJwt) {
    try {
      const refreshed = await sdk.auth.refresh({
        Authorization: `Bearer ${verifyJwt}`,
      })

      if (isVerificationRequired(refreshed)) {
        await clearVerifyToken()
        return {
          ok: true,
          logged_in: false,
          message: "E-postanız doğrulandı. Artık giriş yapabilirsiniz.",
        }
      }

      const sessionToken =
        typeof refreshed === "string"
          ? refreshed
          : refreshed &&
              typeof refreshed === "object" &&
              "token" in refreshed &&
              typeof (refreshed as { token?: unknown }).token === "string"
            ? (refreshed as { token: string }).token
            : null

      if (sessionToken) {
        await setAuthToken(sessionToken)
        await attachSessionCart(sessionToken)
        return {
          ok: true,
          logged_in: true,
          message: "E-postanız doğrulandı. Hesabınıza yönlendiriliyorsunuz…",
        }
      }
    } catch {
      /* fall through — user can log in manually */
    }
  }

  await clearVerifyToken()
  return {
    ok: true,
    logged_in: false,
    message: "E-postanız doğrulandı. Artık giriş yapabilirsiniz.",
  }
}

export async function requestPasswordResetAction(
  email: string
): Promise<ActionResult & { message?: string }> {
  const identifier = email.trim()
  if (!identifier || !identifier.includes("@")) {
    return { ok: false, message: "Geçerli bir e-posta adresi gerekli." }
  }

  try {
    await sdk.auth.resetPassword("customer", "emailpass", { identifier })
  } catch {
    /* anti-enumeration: same response regardless */
  }

  return { ok: true, message: FORGOT_PASSWORD_SUCCESS_MESSAGE }
}
