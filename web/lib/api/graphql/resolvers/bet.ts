import type { BetResolvers, Resolvers } from 'web/generated/graphql_api'

const betResolvers: BetResolvers = {
  market: async (bet) => bet.contract,

  user: async (bet, _, { dataSources }) =>
    await dataSources.firebaseAPI.getUser(bet.userId),
}

const resolvers: Resolvers = {
  Bet: betResolvers,
}

export default resolvers
