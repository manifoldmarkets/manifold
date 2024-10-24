import { APIPath } from 'common/api/schema'
import { getBalanceChanges } from './get-balance-changes'
import { getBestComments } from './get-best-comments'
import { getBets } from './get-bets'
import { getComments } from './get-comments'
import { getContract } from './get-contract'
import { getContractTopics } from './get-contract-topics'
import { getCurrentPrivateUser } from './get-current-private-user'
import { getDashboardFromSlug } from './get-dashboard-from-slug'
import { getFeed } from './get-feed'
import { getFollowedGroups } from './get-followed-groups'
import { getGroup } from './get-group'
import { getGroups } from './get-groups'
import { getHeadlines, getPoliticsHeadlines } from './get-headlines'
import { getLeagues } from './get-leagues'
import { getManagrams } from './get-managrams'
import { getMarket } from './get-market'
import { getMe } from './get-me'
import { getModReports } from './get-mod-reports'
import { getNotifications } from './get-notifications'
import { getPositions } from './get-positions'
import { getRelatedMarkets } from './get-related-markets'
import { getRelatedMarketsByGroup } from './get-related-markets-by-group'
import { getGroupsWithTopContracts } from './get-topics-with-markets'
import { getTxns } from './get-txns'
import { getLiteUser, getUser } from './get-user'
import { getUserLimitOrdersWithContracts } from './get-user-limit-orders-with-contracts'
import { getUserPortfolio } from './get-user-portfolio'
import { getUserPortfolioHistory } from './get-user-portfolio-history'
import { getUsers } from './get-users'
import { health } from './health'
import { APIHandler } from './helpers/endpoint'
import { getMarkets } from './markets'
import {
  searchMarketsFull,
  searchMarketsLite,
} from './supabase-search-contract'
import {
  supabasesearchgroups,
  supabasesearchmygroups,
} from './supabase-search-groups'
import { searchUsers } from './supabase-search-users'

// For the read-only API
// Only include GET endpoints that don't need server-side state
export const readHandlers: { [k in APIPath]?: APIHandler<k> } = {
  'read-health': health as any,

  bets: getBets,

  comments: getComments,
  'get-best-comments': getBestComments,

  'get-contract': getContract, // TODO: why have this?
  'market/:id': getMarket,
  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),
  'slug/:slug': getMarket,
  'market/:id/positions': getPositions,
  'market/:contractId/groups': getContractTopics,
  markets: getMarkets,
  'search-markets': searchMarketsLite,
  'search-markets-full': searchMarketsFull,
  'get-related-markets': getRelatedMarkets,
  'get-related-markets-by-group': getRelatedMarketsByGroup,

  'group/:slug': getGroup,
  'group/by-id/:id': getGroup,
  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>
    getMarkets({ groupId: id, limit }, ...rest),
  groups: getGroups,
  'search-groups': supabasesearchgroups,
  'search-my-groups': supabasesearchmygroups,
  'get-followed-groups': getFollowedGroups,
  'get-groups-with-top-contracts': getGroupsWithTopContracts,

  me: getMe,
  'me/private': getCurrentPrivateUser,
  'user/by-id/:id': getUser,
  'user/by-id/:id/lite': getLiteUser,
  'user/:username': getUser,
  'user/:username/lite': getLiteUser,
  'user/:username/bets': (...props) => getBets(...props),
  'get-balance-changes': getBalanceChanges,
  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,
  'get-user-portfolio': getUserPortfolio,
  'get-user-portfolio-history': getUserPortfolioHistory,
  users: getUsers,
  'search-users': searchUsers,

  managrams: getManagrams,
  txns: getTxns,

  headlines: getHeadlines,
  'politics-headlines': getPoliticsHeadlines,
  'get-dashboard-from-slug': getDashboardFromSlug,
  'get-feed': getFeed,
  leagues: getLeagues,
  'get-mod-reports': getModReports,
  'get-notifications': getNotifications,
}

if (require.main === module) {
  console.log(Object.keys(readHandlers).join(' '))
}
