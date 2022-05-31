export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason?: notification_reason_types
  createdTime: number
  viewTime?: number
  isSeen: boolean

  sourceId?: string
  sourceType?: notification_source_types
  sourceContractId?: string
  sourceUserName?: string
  sourceUserUsername?: string
  sourceUserAvatarUrl?: string
}
export type notification_source_types =
  | 'contract'
  | 'comment'
  | 'bet'
  | 'answer'
  | 'liquidity'

export type notification_reason_types =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'tagged'
  | 'replied'
