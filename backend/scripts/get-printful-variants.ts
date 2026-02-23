// Quick script to fetch Printful sync variant IDs
// Run with: npx ts-node backend/scripts/get-printful-variants.ts

import { getSecrets, getServiceAccountCredentials } from 'common/secrets'

async function main() {
  // Load secrets
  const credentials = getServiceAccountCredentials('DEV')
  const secrets = await getSecrets(credentials, 'PRINTFUL_API_TOKEN')
  const token = secrets.PRINTFUL_API_TOKEN

  if (!token) {
    console.error('PRINTFUL_API_TOKEN not found in secrets')
    process.exit(1)
  }

  console.log('Fetching Printful store products...\n')

  // Get all products
  const productsRes = await fetch('https://api.printful.com/store/products', {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!productsRes.ok) {
    console.error('Failed to fetch products:', await productsRes.text())
    process.exit(1)
  }

  const productsData = await productsRes.json()
  const products = productsData.result

  console.log(`Found ${products.length} product(s):\n`)

  // For each product, get its variants
  for (const product of products) {
    console.log(`\n========================================`)
    console.log(`Product: ${product.name}`)
    console.log(`Product ID: ${product.id}`)
    console.log(`----------------------------------------`)

    // Get product details with variants
    const detailRes = await fetch(
      `https://api.printful.com/store/products/${product.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!detailRes.ok) {
      console.error(`  Failed to fetch details: ${await detailRes.text()}`)
      continue
    }

    const detailData = await detailRes.json()
    const variants = detailData.result.sync_variants

    console.log(`\nVariants (use these IDs in items.ts):\n`)
    console.log(`variants: [`)
    for (const variant of variants) {
      const size = variant.name.split(' - ').pop() || variant.name
      console.log(`  { size: '${size}', printfulSyncVariantId: '${variant.id}' },`)
    }
    console.log(`]`)
  }
}

main().catch(console.error)
