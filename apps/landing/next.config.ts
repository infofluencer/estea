import path from 'node:path'
import type { NextConfig } from 'next'

// Telefondan yerel ağ IP'siyle (ör. http://192.168.1.20:3020) açınca Next 16 dev
// sunucusu JS/HMR isteklerini engeller; sayfa hydrate olmaz, menü açılmaz.
const lanDevOrigins = ['192.168.*.*', '10.*.*.*', '172.*.*.*', '*.local']

const nextConfig: NextConfig = {
  allowedDevOrigins: lanDevOrigins,
  images: {
    // AVIF destekleyen tarayıcıya AVIF (WebP'den ~%20-30 küçük), diğerine WebP.
    formats: ['image/avif', 'image/webp'],
    // Next 16'da izin listesi zorunlu; 85 yalnız tam ekran hero fotoğrafı için.
    qualities: [75, 85],
    // Varsayılan 4 saat; dosyalar nadiren değişir, değişirse adı değişsin.
    minimumCacheTTL: 60 * 60 * 24 * 7,
  },
  transpilePackages: ['@estea/ui'],
  // Dockerfile.landing: .next/standalone tek başına çalışır (node apps/landing/server.js).
  output: 'standalone',
  // Monorepo kökü: standalone çıktısı workspace paketlerini (@estea/ui) de izlesin.
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
