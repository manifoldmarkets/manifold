import type { QueryResolvers, Resolvers } from 'web/generated/graphql_api'

const queryResolvers: QueryResolvers = {
  markets: async () => [],
}

const resolver: Resolvers = {
  Query: queryResolvers,
}

export default resolver
