export type Reaction = {
  id: string
  contentId: string // will be id of the content liked, i.e. contract.id, comment.id, etc.
  contentParentId: string // will be id of the parent object, i.e. contract.id, user.id
  contentType: ReactionContentTypes
  type: ReactionTypes
  createdTime: number

  // The liker
  userId: string
  userUsername: string
  userAvatarUrl: string
  userDisplayName: string

  // The owner of the liked content
  contentOwnerId: string

  slug: string // Used for notifications
  title: string // Used for notifications
  text: string // Used for notifications

  data?: { [key: string]: any }
}
export type ReactionContentTypes = 'contract' | 'comment'
export type ReactionTypes = 'like'
