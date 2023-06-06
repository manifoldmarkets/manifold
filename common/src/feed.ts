export type FEED_DATA_TYPES =
  | 'new_comment'
  | 'news_with_related_contracts'
  | 'new_contract'
  | 'contract_probability_changed'
  | 'popular_comment'

export type FEED_REASON_TYPES =
  | 'follow_contract'
  | 'liked_contract'
  | 'viewed_contract'
  | 'contract_in_group_you_are_in'
  | 'similar_interest_vector_to_user'
  | 'similar_interest_vector_to_contract'
  | 'follow_user'

export const FeedExplanationDictionary: Record<
  FEED_DATA_TYPES,
  Partial<Record<FEED_REASON_TYPES, string>>
> = {
  new_comment: {
    follow_contract: 'New comment on contract you follow',
    liked_contract: 'New comment on contract you liked',
    viewed_contract: 'New comment on contract you viewed',
    contract_in_group_you_are_in:
      'New comment on contract in a group you are in',
    similar_interest_vector_to_user:
      'New comment by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New comment on a contract you may be interested in',
    follow_user: 'New comment by a creator you follow',
  },
  news_with_related_contracts: {
    follow_contract: 'News about contract you follow',
    liked_contract: 'News about contract you liked',
    viewed_contract: 'News about contract you viewed',
    contract_in_group_you_are_in: 'News about contract in a group you are in',
    similar_interest_vector_to_user:
      'News related to a creator you may be interested in',
    similar_interest_vector_to_contract:
      'News related to a contract you may be interested in',
    follow_user: 'News about a contract by a creator you follow',
  },
  new_contract: {
    contract_in_group_you_are_in: 'New contract in a group you are in',
    similar_interest_vector_to_user:
      'New contract by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New contract you may be interested in',
    follow_user: 'New contract by a creator you follow',
  },
  contract_probability_changed: {
    follow_contract: 'Market movement on contract you follow',
    liked_contract: 'Market movement on contract you liked',
    viewed_contract: 'Market movement on contract you viewed',
    contract_in_group_you_are_in:
      'Market movement on contract in a group you are in',
    similar_interest_vector_to_user:
      'Market movement on contract by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'Market movement on contract you may be interested in',
    follow_user: 'Market movement on contract by a creator you follow',
  },
  popular_comment: {
    follow_contract: 'Popular comment on contract you follow',
    liked_contract: 'Popular comment on contract you liked',
    viewed_contract: 'Popular comment on contract you viewed',
    contract_in_group_you_are_in:
      'Popular comment on contract in a group you are in',
    similar_interest_vector_to_user:
      'Popular comment by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'Popular comment on a contract you may be interested in',
    follow_user: 'Popular comment by a creator you follow',
  },
}

export function getExplanation(
  feedDataType: FEED_DATA_TYPES,
  feedReasonType: FEED_REASON_TYPES
): string | undefined {
  return FeedExplanationDictionary[feedDataType][feedReasonType]
}
