import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Checkbox, Label } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Giriş ekranına "Beni hatırla" kutusu ekler.
 *
 * Seçim `escay_admin_remember` cookie'sine (path=/auth) yazılır; POST
 * /auth/session sırasında backend bunu okuyup oturumu 7 güne çıkarır
 * (src/api/auth/remember-me.ts). İşaretsizse oturum 12 saat hareketsizlikte
 * kapanır. Varsayılan: işaretli.
 */
const COOKIE = "escay_admin_remember"
const PREF_KEY = "escay_admin_remember_pref"
const WEEK_SECONDS = 7 * 24 * 60 * 60

function writeCookie(remember: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = remember
    ? `${COOKIE}=1; Path=/auth; Max-Age=${WEEK_SECONDS * 52}; SameSite=Lax${secure}`
    : `${COOKIE}=; Path=/auth; Max-Age=0; SameSite=Lax${secure}`
}

function readPref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "0"
  } catch {
    return true
  }
}

const LoginRememberMe = () => {
  const [remember, setRemember] = useState(readPref)

  useEffect(() => {
    writeCookie(remember)
    try {
      localStorage.setItem(PREF_KEY, remember ? "1" : "0")
    } catch {
      // yoksay
    }
  }, [remember])

  return (
    <div className="flex items-center gap-x-2">
      <Checkbox
        id="escay-remember-me"
        checked={remember}
        onCheckedChange={(v) => setRemember(v === true)}
      />
      <Label htmlFor="escay-remember-me" size="small" className="cursor-pointer">
        Beni hatırla (7 gün)
      </Label>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "login.after",
})

export default LoginRememberMe
