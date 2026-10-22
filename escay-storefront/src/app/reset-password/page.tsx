import Link from "next/link"
import { ResetPasswordForm } from "./ResetPasswordForm"
import styles from "./reset-password.module.css"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ token?: string; email?: string }>

function InvalidLinkState() {
  return (
    <div className="page-shell">
      <div className={styles.page} data-testid="reset-password-invalid">
        <header className={styles.head}>
          <h1 className={styles.title}>Geçersiz bağlantı</h1>
          <p className={styles.lead}>
            Şifre sıfırlama bağlantısı geçersiz veya eksik. Lütfen e-postanızdaki
            en güncel bağlantıyı kullanın.
          </p>
        </header>
        <div className={styles.actions}>
          <Link href="/" className={styles.link}>
            Ana sayfaya dön
          </Link>
        </div>
      </div>
    </div>
  )
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { token, email } = await searchParams
  const normalizedToken = token?.trim()
  const normalizedEmail = email?.trim()

  if (!normalizedToken || !normalizedEmail) {
    return <InvalidLinkState />
  }

  return (
    <div className="page-shell">
      <ResetPasswordForm token={normalizedToken} email={normalizedEmail} />
    </div>
  )
}
