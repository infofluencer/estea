import { redirect } from "next/navigation"
import { getLoggedInCustomer } from "@/lib/auth/customer"

export const dynamic = "force-dynamic"

/** Kayıt artık slide-in panelde — bu rota panele yönlendirir. */
export default async function RegisterPage() {
  const customer = await getLoggedInCustomer()
  if (customer) redirect("/hesabim")
  redirect("/?register=1")
}
