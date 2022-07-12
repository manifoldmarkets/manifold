import { difference } from 'lodash'

export const CATEGORIES_GROUP_SLUG_POSTFIX = '-default-test'
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

export const EXCLUDED_CATEGORIES: category[] = ['fun', 'manifold', 'personal']

export const DEFAULT_CATEGORIES = difference(CATEGORY_LIST, EXCLUDED_CATEGORIES)
