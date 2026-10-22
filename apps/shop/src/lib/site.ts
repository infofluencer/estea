export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3021').replace(/\/+$/, '')

export const landingUrl = (process.env.NEXT_PUBLIC_LANDING_URL ?? 'http://localhost:3020').replace(/\/+$/, '')

export const productsPath = '/urunler'

export function productPath(id: string) {
  return `${productsPath}/${id}`
}
