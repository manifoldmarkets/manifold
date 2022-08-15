import { difference } from 'lodash'

export const CATEGORIES_GROUP_SLUG_POSTFIX = '-default'

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
}

export type category = keyof typeof CATEGORIES

export const TO_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORIES).map(([k, v]) => [v, k])
)

export const CATEGORY_LIST = Object.keys(CATEGORIES)

export const EXCLUDED_CATEGORIES: category[] = [
  'fun',
  'manifold',
  'personal',
  'covid',
  'gaming',
  'crypto',
]

export const DEFAULT_CATEGORIES = difference(CATEGORY_LIST, EXCLUDED_CATEGORIES)

export const DEFAULT_CATEGORY_GROUPS = DEFAULT_CATEGORIES.map((c) => ({
  slug: c.toLowerCase() + CATEGORIES_GROUP_SLUG_POSTFIX,
  name: CATEGORIES[c as category],
}))
