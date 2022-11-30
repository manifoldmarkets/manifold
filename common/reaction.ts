export type Reaction = {
  id: string // will be id of the object liked, i.e. contract.id, comment.id, etc.
  onType: 'contract' | 'comment'
  type: 'like'
  createdTime: number

  // The liker
  userId: string
  userUsername: string
  userAvatarUrl: string
  userDisplayName: string

  // The likee
  toUserId: string

  slug: string // Used for notifications
  text: string // Used for notifications

  tipTxnId?: string
  tipTxnAmount?: number
}
