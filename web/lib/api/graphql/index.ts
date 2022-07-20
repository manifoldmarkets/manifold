import { ApolloServer } from 'apollo-server-micro'
import { ApolloServerPluginLandingPageGraphQLPlayground } from 'apollo-server-core'

import dataSources from './datasources'
import resolvers from './resolvers'
import typeDefs from 'web/generated/schema.graphql'

export const apolloServer = new ApolloServer({
  csrfPrevention: true,
  cache: 'bounded',
  plugins: [ApolloServerPluginLandingPageGraphQLPlayground()],

  dataSources,
  resolvers,
  typeDefs,
})
