/**
 * Seed address + completed order for a verified staging customer.
 *
 *   STAGING_BACKEND_URL=http://IP:9001 \
 *   STAGING_PUBLISHABLE_KEY=pk_... \
 *   STAGING_VERIFIED_EMAIL=staging-e2e@escay.test \
 *   STAGING_VERIFIED_PASSWORD='StagingE2E2026!a' \
 *   npx tsx src/scripts/seed-staging-customer-data.ts
 */
async function main() {
  const backend = (process.env.STAGING_BACKEND_URL || "").replace(/\/$/, "")
  const pk =
    process.env.STAGING_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY?.trim() ||
    ""
  const email = (
    process.env.STAGING_VERIFIED_EMAIL || "staging-e2e@escay.test"
  )
    .trim()
    .toLowerCase()
  const password =
    process.env.STAGING_VERIFIED_PASSWORD?.trim() || "StagingE2E2026!a"

  if (!backend || !pk) {
    throw new Error("STAGING_BACKEND_URL + STAGING_PUBLISHABLE_KEY gerekli")
  }

  const storeHeaders = {
    "content-type": "application/json",
    "x-publishable-api-key": pk,
  }

  const login = await fetch(`${backend}/auth/customer/emailpass`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const loginJson = (await login.json()) as {
    token?: string
    verification_required?: boolean
  }
  if (!login.ok || !loginJson.token || loginJson.verification_required) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(loginJson)}`)
  }
  const auth = {
    ...storeHeaders,
    Authorization: `Bearer ${loginJson.token}`,
  }

  // Address
  const addrBody = {
    first_name: "Staging",
    last_name: "E2E",
    address_1: "Test Cad. No:1 Daire:3",
    city: "İstanbul",
    postal_code: "34380",
    country_code: "tr",
    phone: "05551112233",
    address_name: "Ev",
    metadata: { district: "Şişli" },
  }
  const addrRes = await fetch(`${backend}/store/customers/me/addresses`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(addrBody),
  })
  const addrJson = await addrRes.json().catch(() => ({}))
  if (!addrRes.ok) {
    console.warn("Address create:", addrRes.status, addrJson)
  } else {
    console.log("OK address")
  }

  const regions = await fetch(`${backend}/store/regions?limit=1`, {
    headers: storeHeaders,
  })
  const regionId = (
    (await regions.json()) as { regions?: { id: string }[] }
  ).regions?.[0]?.id
  if (!regionId) throw new Error("No region")

  const products = await fetch(
    `${backend}/store/products?limit=10&region_id=${regionId}&country_code=tr&fields=*variants,+variants.inventory_quantity`,
    { headers: storeHeaders }
  )
  const prodJson = (await products.json()) as {
    products?: {
      variants?: { id: string; inventory_quantity?: number | null }[]
    }[]
  }
  let variantId = ""
  for (const p of prodJson.products || []) {
    for (const v of p.variants || []) {
      if (v.inventory_quantity == null || v.inventory_quantity > 0) {
        variantId = v.id
        break
      }
    }
    if (variantId) break
  }
  if (!variantId) throw new Error("No variant")

  const cartRes = await fetch(`${backend}/store/carts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ region_id: regionId, email }),
  })
  const cartId = ((await cartRes.json()) as { cart?: { id: string } }).cart?.id
  if (!cartId) throw new Error("No cart")

  // Attach cart to logged-in customer
  await fetch(`${backend}/store/carts/${cartId}/customer`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  }).catch(() => undefined)

  await fetch(`${backend}/store/carts/${cartId}/transfer-customer`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({}),
  }).catch(() => undefined)

  await fetch(`${backend}/store/carts/${cartId}/line-items`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ variant_id: variantId, quantity: 1 }),
  })

  const shippingAddress = {
    first_name: "Staging",
    last_name: "E2E",
    address_1: "Test Cad. No:1 Daire:3",
    city: "İstanbul",
    country_code: "tr",
    postal_code: "34380",
    phone: "05551112233",
    metadata: { district: "Şişli" },
  }
  await fetch(`${backend}/store/carts/${cartId}`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      email,
      shipping_address: shippingAddress,
      billing_address: shippingAddress,
    }),
  })

  const opts = await fetch(
    `${backend}/store/shipping-options?cart_id=${cartId}`,
    { headers: auth }
  )
  const optionId = (
    (await opts.json()) as { shipping_options?: { id: string }[] }
  ).shipping_options?.[0]?.id
  if (!optionId) throw new Error("No shipping")
  await fetch(`${backend}/store/carts/${cartId}/shipping-methods`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ option_id: optionId }),
  })

  const cartPay = await fetch(
    `${backend}/store/carts/${cartId}?fields=*payment_collection,total`,
    { headers: auth }
  )
  const cartPayJson = (await cartPay.json()) as {
    cart?: { payment_collection?: { id?: string }; total?: number }
  }
  let pcId = cartPayJson.cart?.payment_collection?.id
  if (!pcId) {
    const pc = await fetch(`${backend}/store/payment-collections`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ cart_id: cartId }),
    })
    pcId = ((await pc.json()) as { payment_collection?: { id: string } })
      .payment_collection?.id
  }
  if (!pcId) throw new Error("No PC")

  await fetch(`${backend}/store/payment-collections/${pcId}/payment-sessions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      provider_id: "pp_paytr_paytr",
      data: {
        customer_email: email,
        cart_items: [
          {
            name: "Staging seed",
            unit_price: cartPayJson.cart?.total || 100,
            quantity: 1,
          },
        ],
      },
    }),
  })

  const complete = await fetch(`${backend}/store/carts/${cartId}/complete`, {
    method: "POST",
    headers: auth,
  })
  const completeJson = (await complete.json()) as {
    order?: { id: string; display_id?: number }
    type?: string
  }
  if (!completeJson.order?.id) {
    throw new Error(`Complete failed: ${JSON.stringify(completeJson).slice(0, 400)}`)
  }

  console.log("OK order", completeJson.order.id, "display_id", completeJson.order.display_id)
  console.log(`Refresh /account as ${email}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
