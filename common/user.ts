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
