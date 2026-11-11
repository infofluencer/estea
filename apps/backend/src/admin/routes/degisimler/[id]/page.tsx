import { useParams } from "react-router-dom"

import { ReturnDetail } from "../../../components/return-detail"

/** Değişim sayfası — sipariş sayfasından ayrı; sidebar'da Değişimler seçili kalır. */
const Page = () => {
  const { id } = useParams()
  return id ? <ReturnDetail returnId={id} /> : null
}

export const handle = {
  breadcrumb: () => "Değişim",
}

export default Page
