// User interest to user interest distance:
export const MINIMUM_SCORE = 0.0035
export const DEFAULT_FEED_USER_ID = 'yYNDWRmBJDcWW0q1aZFi6xfKNcQ2'
export const ALL_FEED_USER_ID = 'IG3WZ8i3IzY6R4wuTDxuvsXbkxD3'

export type FEED_DATA_TYPES =
  | 'new_comment'
  | 'news_with_related_contracts'
  | 'new_contract'
  | 'contract_probability_changed'
  | 'trending_contract'
  | 'new_subsidy'
  | 'user_position_changed'

type DEPRECATED_FEED_REASON_TYPES =
  | 'viewed_contract'
  | 'similar_interest_vector_to_user'

// TODO: add 'shared_contract'
export type CONTRACT_OR_USER_FEED_REASON_TYPES =
  | 'follow_contract'
  | 'liked_contract'
  | 'contract_in_group_you_are_in'
  | 'similar_interest_vector_to_contract'
  | 'follow_user'
  | 'private_contract_shared_with_you'

export type FEED_REASON_TYPES =
  | CONTRACT_OR_USER_FEED_REASON_TYPES
  | 'similar_interest_vector_to_news_vector'

export type CreatorDetails = {
  id: string
  name: string
  username: string
  avatarUrl: string
}

// TODO: now that we have disinterest vectors, increase this threshold
// User interest to contract distances:
export const INTEREST_DISTANCE_THRESHOLDS: Record<FEED_DATA_TYPES, number> = {
  contract_probability_changed: 0.13,
  trending_contract: 0.175,
  new_contract: 0.125,
  new_comment: 0.125,
  news_with_related_contracts: 0.175, // used to compare user interest vector to news title embedding
  new_subsidy: 0.175,
  user_position_changed: 0.0, // only for followed users
}

export const FeedExplanationDictionary: Record<
  FEED_DATA_TYPES,
  Partial<Record<FEED_REASON_TYPES | DEPRECATED_FEED_REASON_TYPES, string>>
> = {
  new_comment: {
    follow_contract: 'New comment on question you follow',
    liked_contract: 'New comment on question you liked',
    viewed_contract: 'New comment on question you viewed',
    contract_in_group_you_are_in:
      'New comment on question in a group you are in',
    similar_interest_vector_to_user:
      'New comment by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New comment on a question you may be interested in',
    follow_user: 'New comment by a creator you follow',
    private_contract_shared_with_you:
      'New comment on a private question shared with you',
  },
  news_with_related_contracts: {
    follow_contract: 'News about question you follow',
    liked_contract: 'News about question you liked',
    viewed_contract: 'News about question you viewed',
    contract_in_group_you_are_in: 'News about question in a group you are in',
    similar_interest_vector_to_user:
      'News related to a creator you may be interested in',
    similar_interest_vector_to_contract:
      'News related to a question you may be interested in',
    follow_user: 'News about a question by a creator you follow',
    similar_interest_vector_to_news_vector: 'News you may be interested in',
    private_contract_shared_with_you:
      'News about a private question shared with you',
  },
  new_contract: {
    contract_in_group_you_are_in: 'New question in a group you are in',
    similar_interest_vector_to_user:
      'New question by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New question you may be interested in',
    follow_user: 'New question by a creator you follow',
    private_contract_shared_with_you: 'New private question shared with you',
  },
  contract_probability_changed: {
    follow_contract: 'Market movement on question you follow',
    liked_contract: 'Market movement on question you liked',
    viewed_contract: 'Market movement on question you viewed',
    contract_in_group_you_are_in:
      'Market movement on question in a group you are in',
    similar_interest_vector_to_user:
      'Market movement on question by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'Market movement on question you may be interested in',
    follow_user: 'Market movement on question by a creator you follow',
    private_contract_shared_with_you:
      'Market movement on a private question shared with you',
  },
  trending_contract: {
    follow_contract: 'Trending question you follow',
    liked_contract: 'Trending question you liked',
    viewed_contract: 'Trending question you viewed',
    contract_in_group_you_are_in: 'Trending question in a group you are in',
    similar_interest_vector_to_user:
      'Trending question by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'Trending question you may be interested in',
    follow_user: 'Trending question by a creator you follow',
    private_contract_shared_with_you:
      'Trending private question shared with you',
  },
  new_subsidy: {
    contract_in_group_you_are_in:
      'New subsidy on question in a group you are in',
    similar_interest_vector_to_user:
      'New subsidy by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New subsidy on a question you may be interested in',
    follow_user: 'New subsidy by a creator you follow',
    private_contract_shared_with_you:
      'New subsidy on a private question shared with you',
  },
  user_position_changed: {
    contract_in_group_you_are_in: 'New bets on question in a group you are in',
    similar_interest_vector_to_user:
      'New bets by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New bets on a question you may be interested in',
    follow_user: 'New bets by a creator you follow',
    private_contract_shared_with_you:
      'New bets on a private question shared with you',
  },
}

export function getExplanation(
  feedDataType: FEED_DATA_TYPES,
  feedReasonType: FEED_REASON_TYPES | DEPRECATED_FEED_REASON_TYPES
): string | undefined {
  return FeedExplanationDictionary[feedDataType][feedReasonType]
}
