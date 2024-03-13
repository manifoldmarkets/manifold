import { Contract } from 'common/contract'

type PolicyDataType = {
  title: string
  bidenSlug: string
  trumpSlug: string
}

export type PolicyContractType = {
  title: string
  bidenContract: Contract | null | undefined
  trumpContract: Contract | null | undefined
}

export const PolicyData: PolicyDataType[] = [
  {
    title: 'Will gas prices go under $3 a gallon before the midterms?',
    bidenSlug: 'if-biden-is-reelected-president-wil-8dff8b112d5',
    trumpSlug: 'if-trump-becomes-president-will-gas-1c526c9c6b65',
  },
  {
    title: 'Will gas prices stay under $4 a gallon before the midterms?',
    bidenSlug: 'if-biden-is-reelected-president-wil',
    trumpSlug: 'if-trump-becomes-president-will-gas',
  },
  {
    title: 'Gallup satisfaction poll greater than Obama',
    bidenSlug: 'if-biden-is-reelected-will-he-make',
    trumpSlug: 'if-trump-becomes-president-will-he',
  },
]
