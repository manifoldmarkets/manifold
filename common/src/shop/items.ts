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
  perUserLimitPeriod?: 'lifetime' | 'monthly'
  globalLimit?: number
  images?: string[]
  enabled?: boolean
}

export const SHOP_ITEM_CONFIGS: ShopItemConfig[] = [
  {
    id: 'very-rich-badge',
    type: 'digital',
    title: 'Manifold Supporter Badge',
    price: 100000,
    description:
      'Support Manifold! Get this badge next to your name for 30 days.',
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'golden-crown',
    type: 'digital',
    title: 'Golden Crown Border',
    price: 125000,
    description: 'Adds a gold ring and crown icon to your avatar for 30 days.',
    images: ['/promo/promo-2.png'],
    enabled: true,
  },
  {
    id: 'award-plus',
    type: 'digital',
    title: 'Comment award',
    price: 500,
    description:
      'Gift this award to a comment to grant it an icon. The commenter receives 50 M$.',
    images: ['/market-tiers/Plus.svg'],
    enabled: true,
  },
  {
    id: 'award-premium',
    type: 'digital',
    title: 'Premium comment award',
    price: 2500,
    description:
      'Gift this award to a comment to grant it an icon. The commenter receives 250 M$.',
    images: ['/market-tiers/Premium.svg'],
    enabled: true,
  },
  {
    id: 'award-crystal',
    type: 'digital',
    title: 'Crystal comment award',
    price: 10000,
    description:
      'Gift this award to a comment to grant it an icon. The commenter receives 1000 M$.',
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
    perUserLimitPeriod: 'monthly',
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'pampu-skin',
    type: 'digital',
    title: 'PAMPU Yes Bet Button Skin',
    price: 25000,
    description: 'Changes your YES bet buttons to PAMPU across the site.',
    perUserLimit: 1,
    images: ['/logo.png'],
    enabled: true,
  },
  // Physical goods via Printful
  {
    id: 'printful-shirt',
    type: 'printful',
    printfulProductId: 392193718,
    title: '100% Cotton Unisex T-shirt Embroidered Logo and Manifold',
    price: 7500,
    description: 'Premium cotton tee with embroidered logo and Manifold text.',
    enabled: true,
  },
  {
    id: 'printful-hat',
    type: 'printful',
    printfulProductId: 392192064,
    title: 'Structured Baseball Cap with White Embroidered Logo',
    price: 10000,
    description: 'Flexfit 6277 structured twill cap with embroidered logo.',
    enabled: true,
  },
  {
    id: 'printful-tote',
    type: 'printful',
    printfulProductId: 394813635,
    title: 'Eco Tote Bag with Logo',
    price: 5000,
    description: 'Durable eco tote with printed Manifold logo.',
    enabled: true,
  },
  {
    id: 'printful-sticker',
    type: 'printful',
    printfulProductId: 394810103,
    title: 'Manifold logo sticker',
    price: 1000,
    description:
      'High-quality logo sticker for laptops, water bottles, and more.',
    enabled: true,
  },
  {
    id: 'printful-shirt-white-logo',
    type: 'printful',
    printfulProductId: 394750299,
    title: '100% Cotton Unisex T-shirt with White Embroidered Logo Only',
    price: 7500,
    description: 'Premium cotton tee with white embroidered logo.',
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
