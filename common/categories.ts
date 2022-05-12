export const CATEGORIES = {
  politics: 'Politics',
  technology: 'Technology',
  sports: 'Sports',
  gaming: 'Gaming / Esports',
  manifold: 'Manifold Markets',
  science: 'Science',
  world: 'World',
  fun: 'Fun stuff',
  personal: 'Personal',
  economics: 'Economics',
  crypto: 'Crypto',
  health: 'Health',
  // entertainment: 'Entertainment',
  // society: 'Society',
  // friends: 'Friends / Community',
  // business: 'Business',
  // charity: 'Charities / Non-profits',
} as { [category: string]: string }

export const TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
)

export const CATEGORY_LIST = Object.keys(CATEGORIES)
