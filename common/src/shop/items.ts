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
    id: 'digital-sticker-pack',
    type: 'digital',
    title: 'Digital Sticker Pack',
    price: 100,
    description: 'A pack of fun stickers to use across the site.',
    perUserLimit: 1,
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'very-rich-badge',
    type: 'digital',
    title: `"I'm Very Rich" Badge`,
    // Base price; actual price is dynamic in checkout based on global count
    price: 100000,
    description:
      'A flex badge. Each purchase increases the next price by 100,000 M$.',
    images: ['/logo.png'],
    enabled: true,
  },
  {
    id: 'golden-crown',
    type: 'digital',
    title: 'Golden Crown Border',
    price: 500000,
    description:
      'Adds a gold ring and crown icon to your avatar across the site.',
    perUserLimit: 1,
    globalLimit: 10,
    images: ['/promo/promo-2.png'],
    enabled: true,
  },
  {
    id: 'profile-frame',
    type: 'digital',
    title: 'Profile Frame',
    price: 250,
    description: 'Add a special frame to your profile picture.',
    perUserLimit: 1,
    images: ['/favicon.ico'],
    enabled: true,
  },
  {
    id: 'username-glow',
    type: 'digital',
    title: 'Username Glow',
    price: 500,
    description: 'Make your username glow in chats and comments.',
    perUserLimit: 1,
    images: ['/promo/promo-1.png'],
    enabled: true,
  },
  {
    id: 'supporter-badge',
    type: 'digital',
    title: 'Supporter Badge',
    price: 1000,
    description: 'Show your support with a special badge.',
    perUserLimit: 1,
    images: ['/promo/promo-2.png'],
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
