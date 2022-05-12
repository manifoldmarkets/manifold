export const CATEGORIES = {
  politics: 'Politics',
  personal: 'Personal',
  friends: 'Friends / Community',
  technology: 'Technology',
  sports: 'Sports',
  gaming: 'Gaming / Esports',
  manifold: 'Manifold Markets',
  science: 'Science',
  society: 'Society',
  geopolitics: 'Geopolitics',
  fun: 'Fun stuff',
  business: 'Business',
  finance: 'Finance',
  crypto: 'Crypto',
  health: 'Health',
  entertainment: 'Entertainment',
  charity: 'Charities / Non-profits',
} as { [category: string]: string }

export const TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
)

export const CATEGORY_LIST = Object.keys(CATEGORIES)

export const FEED_CATEGORY_LIST = Object.keys(CATEGORIES).filter(
  (cat) => !['personal', 'friends'].includes(cat)
)
