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
  sourceUpdateType?: notification_source_update_types
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
  | 'follow'
  | 'tip'
  | 'admin_message'

export type notification_source_update_types =
  | 'created'
  | 'updated'
  | 'resolved'
  | 'deleted'
  | 'closed'

export type notification_reason_types =
  | 'tagged_user'
  | 'on_users_contract'
  | 'on_contract_with_users_shares_in'
  | 'on_contract_with_users_shares_out'
  | 'on_contract_with_users_answer'
  | 'on_contract_with_users_comment'
  | 'reply_to_users_answer'
  | 'reply_to_users_comment'
  | 'on_new_follow'
