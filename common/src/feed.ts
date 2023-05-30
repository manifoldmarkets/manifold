export type FEED_DATA_TYPES =
  | 'new_comment'
  | 'news'
  | 'new_contract'
  | 'contract_probability_changed'
  | 'popular_comment'

export type FEED_REASON_TYPES =
  | 'follow_contract'
  | 'liked_contract'
  | 'viewed_contract'
  | 'contract_in_group_you_are_in'
  | 'similar_interest_vector_to_creator'
  | 'similar_interest_vector_to_contract'
  | 'follow_creator'
