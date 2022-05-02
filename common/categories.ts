export type category =
  | 'sports'
  | 'politics'
  | 'technology'
  | 'science'
  | 'manifold'
  | 'geopolitics'
  | 'personal'
  | 'fun'
  | 'business'
  | 'finance'
  | 'society'
  | 'entertainment'
  | 'gaming'
  | 'crypto'
  | 'health'
  | 'other'

export const CATEGORIES = {
  politics: 'Politics',
  personal: 'Personal',
  friends: 'Friends / Community',
  technology: 'Technology',
  gaming: 'Gaming / Esports',
  science: 'Science',
  manifold: 'Manifold Markets',
  society: 'Society',
  sports: 'Sports',
  geopolitics: 'Geopolitics',
  fun: 'Goofing around',
  business: 'Business',
  finance: 'Finance',
  crypto: 'Crypto',
  health: 'Health',
  entertainment: 'Entertainment',
  other: 'Other',
}

export const TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
)

export const CATEGORY_LIST = Object.keys(CATEGORIES) as category[]
