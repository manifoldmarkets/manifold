import { SHOP_ITEMS, ShopItem } from 'common/shop/items'
import { SupporterTier } from 'common/supporter-config'

// Lookup for tier shop items - used by both shop.tsx and supporter.tsx
export const TIER_ITEMS: Record<SupporterTier, ShopItem> = {
  basic: SHOP_ITEMS.find((i) => i.id === 'supporter-basic')!,
  plus: SHOP_ITEMS.find((i) => i.id === 'supporter-plus')!,
  premium: SHOP_ITEMS.find((i) => i.id === 'supporter-premium')!,
}
