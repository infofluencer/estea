import { OrderTrackingForm } from "./OrderTrackingForm"

export const metadata = {
  title: "Sipariş Takibi | Es Çay",
}

export default async function OrderTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; email?: string }>
}) {
  const sp = await searchParams
  const initialOrder = typeof sp.order === "string" ? sp.order : ""
  const initialEmail = typeof sp.email === "string" ? sp.email : ""
  const autoLookup = Boolean(initialOrder.trim() && initialEmail.trim())

  return (
    <div className="page-shell">
      <OrderTrackingForm
        initialOrder={initialOrder}
        initialEmail={initialEmail}
        autoLookup={autoLookup}
      />
    </div>
  )
}
