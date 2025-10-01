export type ShopItemType = 'printful' | 'digital' | 'other'

export type ShopItemConfig =
  | (ShopItemConfigBase & { type: 'digital' | 'other' })
  | (ShopItemConfigBase & { type: 'printful'; printfulProductId: number })

export type ShopItemConfigBase = {
  id: string
  title: string
  price: number
  description?: string
  perUserLimit?: number
  globalLimit?: number
  images?: string[]
  enabled?: boolean
}

export const SHOP_ITEM_CONFIGS: ShopItemConfig[] = [
  {
    id: 'very-rich-badge',
    type: 'digital',
    title: 'Manifold Supporter Badge',
    // Base price; actual price is dynamic in checkout based on global count
    price: 50000,
    description:
      'Support Manifold! Each purchase increases the next price by 10,000 M$.',
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'golden-crown',
    type: 'digital',
    title: 'Golden Crown Border',
    price: 75000,
    description:
      'Adds a gold ring and crown icon to your avatar across the site.',
    images: ['/promo/promo-2.png'],
    enabled: true,
  },
  {
    id: 'award-plus',
    type: 'digital',
    title: 'Comment award',
    price: 500,
    description:
      'Give a small award to a comment (giver pays, 50 M$ to author).',
    images: ['/market-tiers/Plus.svg'],
    enabled: true,
  },
  {
    id: 'award-premium',
    type: 'digital',
    title: 'Premium comment award',
    price: 2500,
    description: 'Give a premium award (giver pays, 250 M$ to author).',
    images: ['/market-tiers/Premium.svg'],
    enabled: true,
  },
  {
    id: 'award-crystal',
    type: 'digital',
    title: 'Crystal comment award',
    price: 10000,
    description: 'Give a crystal award (giver pays, 1000 M$ to author).',
    images: ['/market-tiers/Crystal.svg'],
    enabled: true,
  },
  {
    id: 'streak-forgiveness',
    type: 'digital',
    title: 'Streak Forgiveness',
    price: 10000,
    description:
      'Protects your prediction streak from being broken if you miss a day.',
    perUserLimit: 1,
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'pampu-skin',
    type: 'digital',
    title: 'PAMPU Yes Bet Button Skin',
    price: 25000,
    description:
      'Changes your YES buttons to PAMPU across the site. Pure cosmetic flex.',
    perUserLimit: 1,
    images: ['/logo.png'],
    enabled: true,
  },
  // Physical goods via Printful
  {
    id: 'printful-shirt',
    type: 'printful',
    printfulProductId: 392193718,
    title: 'Unisex T-Shirt with Embroidered Logo',
    price: 50000,
    description: 'Premium Bella + Canvas 3001 with embroidered logo.',
    perUserLimit: 2,
    enabled: true,
  },
  {
    id: 'printful-hat',
    type: 'printful',
    printfulProductId: 392192064,
    title: 'Structured Twill Cap with Embroidered Logo',
    price: 60000,
    description: 'Flexfit 6277 structured twill cap with embroidered logo.',
    perUserLimit: 2,
    enabled: true,
  },
]

export function getConfigById(id: string): ShopItemConfig | undefined {
  return SHOP_ITEM_CONFIGS.find((c) => c.id === id)
}

export function getConfigForPrintfulProduct(
  productId: number
): ShopItemConfig | undefined {
  return SHOP_ITEM_CONFIGS.find(
    (c) => c.type === 'printful' && c.printfulProductId === productId
  )
}

export function getEnabledConfigs(): ShopItemConfig[] {
  return SHOP_ITEM_CONFIGS.filter((c) => c.enabled !== false)
}
