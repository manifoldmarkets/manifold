import type { Resolvers } from 'web/generated/graphql_api'

import { merge } from 'lodash'

import marketsResolvers from './market'

const resolvers = merge([marketsResolvers]) as Resolvers

export default resolvers
