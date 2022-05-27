export type Notification = {
  id: string
  userId: string
  reasonText?: string
  reason?: string
  createdTime: number
  viewTime?: number
  isSeen: boolean

  sourceId?: string
  sourceType?: 'contract' | 'comment' | 'bet' | 'answer' | 'liquidity'
  sourceContractId?: string
  sourceUserName?: string
  sourceUserUserName?: string
  sourceUserAvatarUrl?: string
}

export const NotificationSourceTypes = {
  CONTRACT: 'contract',
  COMMENT: 'comment',
  BET: 'bet',
  ANSWER: 'answer',
  liquidity: 'liquidity',
} as const
