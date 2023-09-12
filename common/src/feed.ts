// User interest to user interest distance:
import { sum } from 'lodash'
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
export type CONTRACT_FEED_REASON_TYPES =
  | 'follow_contract'
  | 'liked_contract'
  | 'contract_in_group_you_are_in'
  | 'similar_interest_vector_to_contract'
  | 'follow_user'

export type FEED_REASON_TYPES =
  | CONTRACT_FEED_REASON_TYPES
  | 'similar_interest_vector_to_news_vector'

export const NEW_USER_FEED_DATA_TYPES: FEED_DATA_TYPES[] = [
  'news_with_related_contracts',
  'new_contract',
  'contract_probability_changed',
  'trending_contract',
  'new_subsidy',
]

export const BASE_FEED_DATA_TYPE_SCORES: { [key in FEED_DATA_TYPES]: number } =
  {
    new_comment: 0.1,
    new_contract: 0.15,
    new_subsidy: 0.1,
    news_with_related_contracts: 0.1,
    user_position_changed: 0.1,
    contract_probability_changed: 0.2, // todo: multiply by magnitude of prob change
    trending_contract: 0.2,
  }

export const BASE_FEED_REASON_TYPE_SCORES: {
  [key in FEED_REASON_TYPES]: number
} = {
  follow_contract: 0.4,
  liked_contract: 0.2,
  contract_in_group_you_are_in: 0.2,
  similar_interest_vector_to_contract: 0, // factored in by multiplying by interest distance
  follow_user: 0.3,
  similar_interest_vector_to_news_vector: 0.1,
}

export const getRelevanceScore = (
  feedDataType: FEED_DATA_TYPES,
  reasons: FEED_REASON_TYPES[],
  importanceScore: number,
  interestDistance: number,
  trendingContractType?: 'old' | 'new'
): number => {
  const dataTypeScore =
    trendingContractType === 'old'
      ? 0
      : BASE_FEED_DATA_TYPE_SCORES[feedDataType]

  const reasonsScore = sum(reasons.map((r) => BASE_FEED_REASON_TYPE_SCORES[r]))
  return (
    dataTypeScore +
    reasonsScore +
    importanceScore * 0.3 +
    (1 - interestDistance) * 0.2
  )
}

export type CreatorDetails = {
  id: string
  name: string
  username: string
  avatarUrl: string
}

export const INTEREST_DISTANCE_THRESHOLDS: Record<
  FEED_DATA_TYPES | 'ad',
  number
> = {
  contract_probability_changed: 0.125,
  trending_contract: 0.125,
  new_contract: 0.11,
  new_comment: 0.11,
  news_with_related_contracts: 0.17, // used to compare user interest vector to news title embedding
  new_subsidy: 0.12,
  user_position_changed: 1, // only targets followed users,
  ad: 0.175,
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
  },
  new_contract: {
    contract_in_group_you_are_in: 'New question in a group you are in',
    similar_interest_vector_to_user:
      'New question by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New question you may be interested in',
    follow_user: 'New question by a creator you follow',
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
  },
  new_subsidy: {
    contract_in_group_you_are_in:
      'New subsidy on question in a group you are in',
    similar_interest_vector_to_user:
      'New subsidy by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New subsidy on a question you may be interested in',
    follow_user: 'New subsidy by a creator you follow',
  },
  user_position_changed: {
    contract_in_group_you_are_in: 'New bets on question in a group you are in',
    similar_interest_vector_to_user:
      'New bets by a creator you may be interested in',
    similar_interest_vector_to_contract:
      'New bets on a question you may be interested in',
    follow_user: 'New bets by a creator you follow',
  },
}

export function getExplanation(
  feedDataType: FEED_DATA_TYPES,
  feedReasonType: FEED_REASON_TYPES | DEPRECATED_FEED_REASON_TYPES
): string | undefined {
  return FeedExplanationDictionary[feedDataType][feedReasonType]
}
