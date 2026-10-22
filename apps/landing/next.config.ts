import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@estea/ui'],
  // Dockerfile.landing: .next/standalone tek başına çalışır (node apps/landing/server.js).
  output: 'standalone',
  // Monorepo kökü: standalone çıktısı workspace paketlerini (@estea/ui) de izlesin.
  outputFileTracingRoot: path.join(__dirname, '../../'),
}

export default nextConfig
