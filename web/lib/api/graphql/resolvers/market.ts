import type {
  MarketAnswerResolvers,
  MarketResolvers,
  QueryResolvers,
  Resolvers,
  ResolversTypes,
} from 'web/generated/graphql_api'
import type { MarketModel } from '../types'

import { UserInputError } from 'apollo-server-micro'

function contractVerify(contract?: MarketModel) {
  if (!contract) {
    throw new UserInputError('Contract not found')
  }
  return contract
}
function augmentContract<T>(contract: MarketModel, l: T[]) {
  return l.map((el) => ({
    ...el,
    contract,
  }))
}

const answerResolvers: MarketAnswerResolvers = {
  creator: (answer) => ({
    id: answer.userId,
    name: answer.name,
    username: answer.username,
    avatarUrl: answer.avatarUrl,
  }),

  probability: (answer, _, { dataSources }) =>
    dataSources.firebaseAPI.getOutcomeProbability(answer.contract, answer.id),

  market: async (answer) => answer.contract,
}

const marketResolvers: MarketResolvers = {
  url: async (contract) =>
    `https://manifold.markets/${contract.creatorUsername}/${contract.slug}`,

  creator: async (contract) => ({
    id: contract.creatorId,
    username: contract.creatorUsername,
    name: contract.creatorName,
    avatarUrl: contract.creatorAvatarUrl,
  }),

  outcome: async (contract: MarketModel, _, { dataSources }) => {
    switch (contract.outcomeType) {
      case 'BINARY':
        return {
          __typename: 'MarketOutcomeBinary',
          probability: await dataSources.firebaseAPI.getProbability(contract),
        } as ResolversTypes['MarketOutcomeBinary']

      case 'FREE_RESPONSE':
        return {
          __typename: 'MarketOutcomeFreeResponse',
          answers: augmentContract(contract, contract.answers),
        } as ResolversTypes['MarketOutcomeFreeResponse']

      case 'PSEUDO_NUMERIC':
      case 'NUMERIC':
        return {
          __typename: 'MarketOutcomeNumeric',
          min: contract.min,
          max: contract.max,
        } as ResolversTypes['MarketOutcomeNumeric']
    }
  },

  pool: async (contract) => contract.pool.YES + contract.pool.NO || undefined,

  closeTime: async (contract) =>
    contract.resolutionTime && contract.closeTime
      ? Math.min(contract.resolutionTime, contract.closeTime)
      : contract.closeTime,

  bets: async (contract, _, { dataSources }) =>
    augmentContract(
      contract,
      await dataSources.firebaseAPI.listAllBets(contract.id)
    ),

  comments: async (contract, _, { dataSources }) =>
    augmentContract(
      contract,
      await dataSources.firebaseAPI.listAllComments(contract.id)
    ),
}

const queryResolvers: QueryResolvers = {
  markets: async (_, { before, limit }, { dataSources }) => {
    if (limit < 1 || limit > 1000) {
      throw new UserInputError('limit must be between 1 and 1000')
    }

    try {
      return await dataSources.firebaseAPI.listAllContracts(limit, before)
    } catch (e) {
      throw new UserInputError(
        'Failed to fetch markets (did you pass an invalid ID as the before parameter?)'
      )
    }
  },

  market: async (_, { id }, { dataSources }) =>
    contractVerify(await dataSources.firebaseAPI.getContractFromID(id)),

  slug: async (_, { url }, { dataSources }) =>
    contractVerify(await dataSources.firebaseAPI.getContractFromSlug(url)),
}

const resolver: Resolvers = {
  Query: queryResolvers,
  Market: marketResolvers,
  MarketAnswer: answerResolvers,
}

export default resolver
