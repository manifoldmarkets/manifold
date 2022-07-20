import type { Resolvers, UserResolvers } from 'web/generated/graphql_api'

const userResolvers: UserResolvers = {
  id: (user) => user.id,
}

const resolvers: Resolvers = {
  User: userResolvers,
}

export default resolvers
