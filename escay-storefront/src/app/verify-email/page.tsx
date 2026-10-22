import { VerifyEmailClient } from "./VerifyEmailClient"

export const dynamic = "force-dynamic"

type SearchParams = Promise<{ token?: string; email?: string }>

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { token, email } = await searchParams

  return (
    <div className="page-shell">
      <VerifyEmailClient
        token={token?.trim() || undefined}
        email={email?.trim() || undefined}
      />
    </div>
  )
}
