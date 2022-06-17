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
  contractIds: string[]
}
export const MAX_GROUP_NAME_LENGTH = 75
export const MAX_ABOUT_LENGTH = 140
export const MAX_ID_LENGTH = 60

export type GroupDetails = {
  groupId: string
  groupSlug: string
  groupName: string
}

export type GroupUser = {
  id: string // user id
  username: string
  name: string
  avatarUrl?: string
  role: 'member' | 'creator' | 'admin' | 'follower'
}
