export type groupie = {
  id: string
  createdTime: number
  name: string
  slug: string
  description?: string
  creatorId: string
  creatorName: string
  creatorUsername: string
  creatorAvatarUrl?: string
  adminIds: string[]
  memberIds: string[]
  contractIds: string[]
}

export type UserGroupMetrics = {
  id: string // Same as User.id
  totalPnLCached: number
  totalPoolCached: number
}
