import { redirect } from 'next/navigation'
import { productsPath } from '@/lib/site'

export default function ShopHome() {
  redirect(productsPath)
}
