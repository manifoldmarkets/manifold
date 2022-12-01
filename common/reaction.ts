export type Reaction = {
  id: string // will be id of the object liked, i.e. contract.id, comment.id, etc.
  parentId: string // will be id of the parent object, i.e. contract.id, user.id
  contentType: ReactionContentTypes
  type: ReactionTypes
  createdTime: number

  // The liker
  userId: string
  userUsername: string
  userAvatarUrl: string
  userDisplayName: string

  // The likee
  contentOwnerId: string

  slug: string // Used for notifications
  title: string // Used for notifications

  data?: { [key: string]: any }
}
export type ReactionContentTypes = 'contract' | 'comment'
export type ReactionTypes = 'like'
