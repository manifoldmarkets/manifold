export type User = {
  id: string
  createdTime: number

  name: string
  username: string
  avatarUrl?: string

  // For their user page
  bio?: string
  bannerUrl?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  balance: number
  totalDeposits: number
  totalPnLCached: number
  creatorVolumeCached: number
}

export const STARTING_BALANCE = 1000
export const SUS_STARTING_BALANCE = 10 // for sus users, i.e. multiple sign ups for same person

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  unsubscribedFromResolutionEmails?: boolean
  initialDeviceToken?: string
  initialIpAddress?: string
}
