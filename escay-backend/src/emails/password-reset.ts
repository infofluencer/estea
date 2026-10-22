import { emailLayout, escapeHtml, EMAIL_STYLES } from "./format"

export type PasswordResetData = {
  email: string
  resetUrl: string
  expiresMinutes?: number
}

export function buildPasswordResetEmail(data: PasswordResetData): {
  subject: string
  html: string
  text: string
} {
  const { email, resetUrl, expiresMinutes = 15 } = data
  const subject = "Şifre Sıfırlama — Es Çay"

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">Şifre Sıfırlama</h1>
    <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      Merhaba${email ? ` <strong>${escapeHtml(email)}</strong>` : ""},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      Hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki butona tıklayın.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-radius:6px;background:${EMAIL_STYLES.brandColor};">
          <a href="${escapeHtml(resetUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            Şifremi Sıfırla
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayın:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${escapeHtml(resetUrl)}" style="color:${EMAIL_STYLES.accentColor};">${escapeHtml(resetUrl)}</a>
    </p>

    <p style="margin:0 0 8px;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Bu bağlantı <strong>${expiresMinutes} dakika</strong> geçerlidir.
    </p>
    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz. Şifreniz değişmeyecektir.
    </p>
  `)

  const text = `Şifre Sıfırlama — Es Çay

Merhaba${email ? ` ${email}` : ""},

Hesabınız için şifre sıfırlama talebi aldık. Yeni şifrenizi belirlemek için aşağıdaki bağlantıyı kullanın:

${resetUrl}

Bu bağlantı ${expiresMinutes} dakika geçerlidir.

Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz. Şifreniz değişmeyecektir.

— Es Çay`

  return { subject, html, text }
}
