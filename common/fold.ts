export type Fold = {
  id: string
  slug: string
  name: string
  about: string
  curatorId: string // User id
  createdTime: number

  tags: string[]

  contractIds: string[]
  excludedContractIds: string[]

  // Invariant: exactly one of the following is defined.
  // Default: creatorIds: undefined, excludedCreatorIds: []
  creatorIds?: string[]
  excludedCreatorIds?: string[]

  followCount: number

  disallowMarketCreation?: boolean
}
