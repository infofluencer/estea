import { ContractText } from "@/components/legal/ContractText"
import { LegalLayout } from "@/components/legal/LegalLayout"

export const metadata = {
  title: "Ön Bilgilendirme Formu | Es Çay",
}

export default function OnBilgilendirmePage() {
  return (
    <LegalLayout title="Ön Bilgilendirme Formu" updatedAt="16 Ekim 2026">
      <ContractText kind="on-bilgilendirme-formu" />
    </LegalLayout>
  )
}
