import { ContractText } from "@/components/legal/ContractText"
import { LegalLayout } from "@/components/legal/LegalLayout"

export const metadata = {
  title: "Mesafeli Satış Sözleşmesi | Es Çay",
}

export default function MesafeliSatisPage() {
  return (
    <LegalLayout title="Mesafeli Satış Sözleşmesi" updatedAt="16 Ekim 2026">
      <ContractText kind="mesafeli-satis-sozlesmesi" />
    </LegalLayout>
  )
}
