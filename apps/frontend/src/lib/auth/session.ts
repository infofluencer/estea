import { cookies } from "next/headers"
import {
  AUTH_COOKIE,
  AUTH_COOKIE_OPTIONS,
  VERIFY_COOKIE,
  VERIFY_COOKIE_OPTIONS,
} from "./constants"

export async function getAuthToken() {
  const jar = await cookies()
  return jar.get(AUTH_COOKIE)?.value || null
}

export async function authHeaders(): Promise<Record<string, string> | undefined> {
  const token = await getAuthToken()
  if (!token) return undefined
  return { Authorization: `Bearer ${token}` }
}

export async function setAuthToken(token: string) {
  const jar = await cookies()
  jar.set(AUTH_COOKIE, token, AUTH_COOKIE_OPTIONS)
  jar.delete(VERIFY_COOKIE)
}

export async function clearAuthToken() {
  const jar = await cookies()
  jar.delete(AUTH_COOKIE)
}

export async function getVerifyToken() {
  const jar = await cookies()
  return jar.get(VERIFY_COOKIE)?.value || null
}

export async function setVerifyToken(token: string) {
  const jar = await cookies()
  jar.set(VERIFY_COOKIE, token, VERIFY_COOKIE_OPTIONS)
}

export async function clearVerifyToken() {
  const jar = await cookies()
  jar.delete(VERIFY_COOKIE)
}
