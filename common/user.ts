export type User = {
  id: string
  createdTime: number

  name: string
  username: string
  avatarUrl?: string

  balance: number
  totalPnLCached: number
  creatorVolumeCached: number
}

export const STARTING_BALANCE = 1000
export const SUS_STARTING_BALANCE = 10 // for sus users, i.e. multiple sign ups for same person

export type PrivateUser = {
  email?: string
  unsubscribedFromResolutionEmails?: boolean
  initialDeviceToken?: string
  initialIpAddress?: string
}
