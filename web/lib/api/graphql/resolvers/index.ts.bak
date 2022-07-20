import type { Resolvers } from 'web/generated/graphql_api'

import { merge } from 'lodash'

import scalarResolvers from './scalars'
import marketsResolvers from './market'
import userResolvers from './user'
import betResolvers from './bet'
import commentResolvers from './comment'

const resolvers = merge([
  scalarResolvers,
  marketsResolvers,
  betResolvers,
  userResolvers,
  commentResolvers,
]) as Resolvers

export default resolvers
