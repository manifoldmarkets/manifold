export const CATEGORIES = {
  politics: 'Politics',
  technology: 'Technology',
  science: 'Science',
  world: 'World',
  sports: 'Sports',
  economics: 'Economics',
  personal: 'Personal',
  culture: 'Culture',
  manifold: 'Manifold',
  covid: 'Covid',
  crypto: 'Crypto',
  gaming: 'Gaming',
  fun: 'Fun',
} as { [category: string]: string }

export const TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
)

export const CATEGORY_LIST = Object.keys(CATEGORIES)
