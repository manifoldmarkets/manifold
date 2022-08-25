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
  sourceText?: string

  sourceContractTitle?: string
  sourceContractCreatorUsername?: string
  sourceContractSlug?: string

  sourceSlug?: string
  sourceTitle?: string

  isSeenOnHref?: string
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
  | 'group'
  | 'user'
  | 'bonus'
  | 'challenge'
  | 'betting_streak_bonus'
  | 'loan'

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
  | 'you_follow_user'
  | 'added_you_to_group'
  | 'you_referred_user'
  | 'user_joined_to_bet_on_your_market'
  | 'unique_bettors_on_your_contract'
  | 'on_group_you_are_member_of'
  | 'tip_received'
  | 'bet_fill'
  | 'user_joined_from_your_group_invite'
  | 'challenge_accepted'
  | 'betting_streak_incremented'
  | 'loan_income'
  | 'you_follow_contract'
