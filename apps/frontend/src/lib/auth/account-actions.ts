"use server"

import {
  validateCheckoutAddress,
  type CheckoutAddressInput,
} from "../checkout-address"
import { sdk } from "../medusa"
import {
  AUTH_PASSWORD_MIN_LENGTH,
  authPasswordTooShortMessage,
} from "./constants"
import { errMessage } from "./errors"
import { authHeaders } from "./session"
import type { ActionResult } from "./actions"

export type AddressInput = CheckoutAddressInput

async function requireAuthHeaders() {
  const headers = await authHeaders()
  if (!headers) throw new Error("Oturum gerekli.")
  return headers
}

export async function updateCustomerProfileAction(input: {
  first_name: string
  last_name: string
}): Promise<ActionResult> {
  try {
    const headers = await requireAuthHeaders()
    await sdk.store.customer.update(
      {
        first_name: input.first_name.trim(),
        last_name: input.last_name.trim(),
      },
      {},
      headers
    )
    return { ok: true, message: "Profil bilgileriniz güncellendi." }
  } catch (e) {
    return {
      ok: false,
      message: errMessage(e, "Profil güncellenemedi."),
    }
  }
}

export async function changePasswordAction(input: {
  current_password: string
  new_password: string
  new_password_confirm: string
}): Promise<ActionResult> {
  const current = input.current_password
  const next = input.new_password
  const confirm = input.new_password_confirm

  if (!current) {
    return { ok: false, message: "Mevcut şifrenizi girin.", code: "validation" }
  }
  if (next.length < AUTH_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: authPasswordTooShortMessage(),
      code: "validation",
    }
  }
  if (next !== confirm) {
    return {
      ok: false,
      message: "Yeni şifreler eşleşmiyor.",
      code: "validation",
    }
  }
  if (current === next) {
    return {
      ok: false,
      message: "Yeni şifre mevcut şifreden farklı olmalıdır.",
      code: "validation",
    }
  }

  try {
    const headers = await requireAuthHeaders()
    await sdk.client.fetch("/store/customers/me/password", {
      method: "POST",
      body: {
        current_password: current,
        new_password: next,
      },
      headers,
    })
    return { ok: true, message: "Şifreniz güncellendi." }
  } catch (e) {
    return {
      ok: false,
      message: errMessage(e, "Şifre güncellenemedi."),
    }
  }
}

export async function createCustomerAddressAction(
  input: AddressInput
): Promise<ActionResult> {
  try {
    const validated = validateCheckoutAddress(input)
    if (!validated.ok) return { ok: false, message: validated.message }

    const headers = await requireAuthHeaders()
    const a = validated.normalized
    await sdk.store.customer.createAddress(
      {
        first_name: a.first_name,
        last_name: a.last_name,
        address_1: a.address_1,
        address_2: a.neighbourhood,
        city: a.city,
        postal_code: a.postal_code,
        country_code: a.country_code || "tr",
        phone: a.phone,
        address_name: "Ev",
        metadata: {
          district: a.district,
          neighbourhood: a.neighbourhood,
          city_code: a.city_code,
        },
      },
      {},
      headers
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Adres eklenemedi.") }
  }
}

export async function updateCustomerAddressAction(
  addressId: string,
  input: AddressInput
): Promise<ActionResult> {
  try {
    if (!addressId) return { ok: false, message: "Adres bulunamadı." }
    const validated = validateCheckoutAddress(input)
    if (!validated.ok) return { ok: false, message: validated.message }

    const headers = await requireAuthHeaders()
    const a = validated.normalized
    await sdk.store.customer.updateAddress(
      addressId,
      {
        first_name: a.first_name,
        last_name: a.last_name,
        address_1: a.address_1,
        address_2: a.neighbourhood,
        city: a.city,
        postal_code: a.postal_code,
        country_code: a.country_code || "tr",
        phone: a.phone,
        metadata: {
          district: a.district,
          neighbourhood: a.neighbourhood,
          city_code: a.city_code,
        },
      },
      {},
      headers
    )
    return { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Adres güncellenemedi.") }
  }
}

export async function deleteCustomerAddressAction(
  addressId: string
): Promise<ActionResult> {
  try {
    if (!addressId) return { ok: false, message: "Adres bulunamadı." }
    const headers = await requireAuthHeaders()
    await sdk.store.customer.deleteAddress(addressId, headers)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: errMessage(e, "Adres silinemedi.") }
  }
}
