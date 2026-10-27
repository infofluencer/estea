# escay-storefront

Es Çay mağazası — Next.js 15 App Router storefront (Medusa v2 BFF). Mimari için kök `ES-CAY-BLUEPRINT.md` §5.

```bash
cp .env.template .env.local   # değerleri doldur
npm install
npm run dev                   # http://localhost:3025
npm run lint && npx tsc --noEmit
npm run build                 # standalone çıktı (Dockerfile.storefront kökte)
```

- Tarayıcı Medusa'yı doğrudan çağırmaz; tüm çağrılar RSC / Server Action (`src/lib/medusa.ts`).
- Marka sabitleri: `src/lib/company.ts`, `src/lib/site.ts`, `src/lib/copy.ts`; tasarım token'ları `src/app/globals.css` `:root`.
- Paylaşılan kod: `@escay/shared/*` → kök `shared/` (`experimental.externalDir`).
- Ürün feed'leri: `/feeds/google.xml`, `/feeds/meta.xml`.
- E2E (yalnızca staging): `npm run test:staging:e2e` (`e2e/utils/env.ts` prod host'u reddeder).
- Açık kararlar `TODO(K…)` ile işaretli (K2 KDV, K4 kargo ücreti, K5 iade/gıda, K6 varyant/özellik, K7 takip hesapları, K8 domain).

<!-- Deploy kontrolü: Dokploy watch paths (2026-10-26). -->
