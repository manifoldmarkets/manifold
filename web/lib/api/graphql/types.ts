import type { FirebaseAPI } from './datasources/firebaseAPI'
import type { Answer } from 'common/answer'
import type { Bet } from 'common/bet'
import type { Comment } from 'common/comment'
import type { Contract } from 'common/contract'

/* Model types, used internally by resolvers */
export type MarketModel = Contract
export type AnswerModel = Answer & { contract: MarketModel }
export type CommentModel = Comment & { contract: MarketModel }
export type BetModel = Bet & { contract: MarketModel }

/* Context type */
export type contextType = {
  dataSources: {
    firebaseAPI: FirebaseAPI
  }
}
