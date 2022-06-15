export type Group = {
  id: string
  slug: string
  name: string
  about: string
  creatorId: string // User id
  createdTime: number
  mostRecentActivityTime: number
  memberIds: string[] // User ids
  anyoneCanJoin: boolean
  visibility: 'public' | 'private' | 'unlisted'
  contractIds: string[]
  followCount: number
}
