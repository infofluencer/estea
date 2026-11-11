import { useParams } from "react-router-dom"

import { ReturnDetail } from "../../../components/return-detail"

/** İade sayfası — sipariş sayfasından ayrı; sidebar'da İadeler seçili kalır. */
const Page = () => {
  const { id } = useParams()
  return id ? <ReturnDetail returnId={id} /> : null
}

export const handle = {
  breadcrumb: () => "İade",
}

export default Page
