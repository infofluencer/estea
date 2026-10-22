import { emailLayout, escapeHtml, EMAIL_STYLES } from "./format"

export type EmailVerificationData = {
  email: string
  verifyUrl: string
  expiresHours?: number
}

export function buildEmailVerificationEmail(data: EmailVerificationData): {
  subject: string
  html: string
  text: string
} {
  const { email, verifyUrl, expiresHours = 24 } = data
  const subject = "E-posta Doğrulama — Es Çay"

  const html = emailLayout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${EMAIL_STYLES.brandColor};">E-posta Doğrulama</h1>
    <p style="margin:0 0 16px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      Merhaba${email ? ` <strong>${escapeHtml(email)}</strong>` : ""},
    </p>
    <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_STYLES.mutedColor};line-height:24px;">
      Es Çay hesabınızı oluşturduğunuz için teşekkürler. Hesabınızı aktifleştirmek için
      aşağıdaki butona tıklayarak e-posta adresinizi doğrulayın.
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
      <tr>
        <td style="border-radius:6px;background:${EMAIL_STYLES.brandColor};">
          <a href="${escapeHtml(verifyUrl)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
            E-postamı Doğrula
          </a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 8px;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Buton çalışmıyorsa aşağıdaki bağlantıyı tarayıcınıza kopyalayın:
    </p>
    <p style="margin:0 0 24px;font-size:13px;line-height:20px;word-break:break-all;">
      <a href="${escapeHtml(verifyUrl)}" style="color:${EMAIL_STYLES.accentColor};">${escapeHtml(verifyUrl)}</a>
    </p>

    <p style="margin:0 0 8px;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Bu bağlantı <strong>${expiresHours} saat</strong> geçerlidir.
    </p>
    <p style="margin:0;font-size:13px;color:${EMAIL_STYLES.mutedColor};line-height:20px;">
      Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.
    </p>
  `)

  const text = `E-posta Doğrulama — Es Çay

Merhaba${email ? ` ${email}` : ""},

Es Çay hesabınızı oluşturduğunuz için teşekkürler. Hesabınızı aktifleştirmek için aşağıdaki bağlantıyı kullanın:

${verifyUrl}

Bu bağlantı ${expiresHours} saat geçerlidir.

Bu hesabı siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.

— Es Çay`

  return { subject, html, text }
}
