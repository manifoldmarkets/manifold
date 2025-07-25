import { createPublicChatMessage } from 'api/create-public-chat-message'
import { createuser } from 'api/create-user'
import { getBalanceChanges } from 'api/get-balance-changes'
import { getBestComments } from 'api/get-best-comments'
import { getBoostAnalytics } from 'api/get-boost-analytics'
import { getFeed } from 'api/get-feed'
import { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'
import { getManaSummaryStats } from 'api/get-mana-summary-stats'
import { getNotifications } from 'api/get-notifications'
import {
  getChannelMemberships,
  getChannelMessages,
  getLastSeenChannelTime,
  setChannelLastSeenTime,
} from 'api/get-private-messages'
import { getSeenMarketIds } from 'api/get-seen-market-ids'
import { getGroupsWithTopContracts } from 'api/get-topics-with-markets'
import { getTxnSummaryStats } from 'api/get-txn-summary-stats'
import { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'
import { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'
import { completeCashoutSession } from 'api/gidx/complete-cashout-session'
import { completeCheckoutSession } from 'api/gidx/complete-checkout-session'
import { getCheckoutSession } from 'api/gidx/get-checkout-session'
import { getMonitorStatus } from 'api/gidx/get-monitor-status'
import { getVerificationDocuments } from 'api/gidx/get-verification-documents'
import { getVerificationStatus } from 'api/gidx/get-verification-status'
import { register } from 'api/gidx/register'
import { uploadDocument } from 'api/gidx/upload-document'
import { getMarkets } from 'api/markets'
import { multiSell } from 'api/multi-sell'
import { placeMultiBet } from 'api/place-multi-bet'
import { post } from 'api/post'
import { recordCommentView } from 'api/record-comment-view'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { recordContractView } from 'api/record-contract-view'
import { requestLoan } from 'api/request-loan'
import { requestOTP } from 'api/request-phone-otp'
import { searchContractPositions } from 'api/search-contract-positions'
import { updateMarket } from 'api/update-market'
import { verifyPhoneNumber } from 'api/verify-phone-number'
import { type APIPath } from 'common/api/schema'
import { addBounty } from './add-bounty'
import { addLiquidity } from './add-liquidity'
import { addOrRemoveTopicFromContract } from './add-topic-to-market'
import { addOrRemoveTopicFromTopic } from './add-topic-to-topic'
import { awardBounty } from './award-bounty'
import { blockGroup, unblockGroup } from './block-group'
import { blockMarket, unblockMarket } from './block-market'
import { blockUser, unblockUser } from './block-user'
import { cancelBet } from './cancel-bet'
import { checkSportsEvent } from './check-sports-event'
import { closeMarket } from './close-market'
import { convertCashToMana } from './convert-cash-to-mana'
import { convertSpiceToMana } from './convert-sp-to-mana'
import { createAnswerCPMM } from './create-answer-cpmm'
import { createComment } from './create-comment'
import { createManalink } from './create-manalink'
import { createMarket } from './create-market'
import { deleteGroup } from './delete-group'
import { deleteMe } from './delete-me'
import { donate } from './donate'
import { fetchLinkPreview } from './fetch-link-preview'
import { followContract } from './follow-contract'
import { generateAIAnswers } from './generate-ai-answers'
import { generateAIDescription } from './generate-ai-description'
import { generateAIMarketSuggestions } from './generate-ai-market-suggestions'
import { getSingleAnswer } from './get-answer'
import { getBetPointsBetween, getBets } from './get-bets'
import { getCashouts } from './get-cashouts'
import {
  getCommentThread,
  getContractCommentThreads,
} from './get-comment-threads'
import { getComments, getUserComments } from './get-comments'
import { getContract } from './get-contract'
import { getContractAnswers } from './get-contract-answers'
import { getContractTopics } from './get-contract-topics'
import { getCurrentPrivateUser } from './get-current-private-user'
import { getDailyChangedMetricsAndContracts } from './get-daily-changed-metrics-and-contracts'
import { getDashboardFromSlug } from './get-dashboard-from-slug'
import { getFollowedGroups } from './get-followed-groups'
import { getGroup } from './get-group'
import { getGroups } from './get-groups'
import { getHeadlines, getPoliticsHeadlines } from './get-headlines'
import { getLeaderboard } from './get-leaderboard'
import { getLeagues } from './get-leagues'
import { getManaSupply } from './get-mana-supply'
import { getManagrams } from './get-managrams'
import { getMarket } from './get-market'
import { getMarketProb } from './get-market-prob'
import { getMarketProbs } from './get-market-probs'
import { getMarketsByIds } from './get-markets'
import { getmaxminprofit2024 } from './get-max-min-profit-2024'
import { getMe } from './get-me'
import { getModReports } from './get-mod-reports'
import { getmonthlybets2024 } from './get-monthly-bets-2024'
import { getNextLoanAmount } from './get-next-loan-amount'
import { getPartnerStats } from './get-partner-stats'
import { getPositions } from './get-positions'
import { getRelatedMarkets } from './get-related-markets'
import { getRelatedMarketsByGroup } from './get-related-markets-by-group'
import { getTopicDashboards } from './get-topic-dashboards'
import { getTopicTopics } from './get-topic-topics'
import { getTxns } from './get-txns'
import { getLiteUser, getUser } from './get-user'
import { getUserPortfolio } from './get-user-portfolio'
import { getUserPortfolioHistory } from './get-user-portfolio-history'
import { getUsers } from './get-users'
import { getUserBalancesByIds, getUsersByIds } from './get-users-by-ids'
import { completeCashoutRequest } from './gidx/complete-cashout-request'
import { type APIHandler } from './helpers/endpoint'
import { hideComment } from './hide-comment'
import { managram } from './managram'
import { pinComment } from './pin-comment'
import { placeBet } from './place-bet'
import { setPushToken } from './push-token'
import { addOrRemoveReaction } from './reaction'
import { refreshAllClients } from './refresh-all-clients'
import { removeLiquidity } from './remove-liquidity'
import { resolveMarket } from './resolve-market'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { searchMarketsFull, searchMarketsLite } from './search-contracts'
import { searchGroups, searchMyGroups } from './search-groups'
import { searchUsers } from './search-users'
import { sellShares } from './sell-shares'
import { setnews } from './set-news'
import { toggleSystemTradingStatus } from './toggle-system-status'
import { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'
import { unresolve } from './unresolve'
import { updateMe } from './update-me'
import { updateModReport } from './update-mod-report'
import { updateNotifSettings } from './update-notif-settings'
import { updatePrivateUser } from './update-private-user'

import { createCategory } from './create-category'
import { createTask } from './create-task'
import { getCategories } from './get-categories'
import { getTasks } from './get-tasks'
import { updateCategory } from './update-category'
import { updateTask } from './update-task'

import { createPost } from './create-post'
import { createPostComment } from './create-post-comment'
import { dismissUserReport } from './dismiss-user-report'
import { editPostComment, updatePostComment } from './edit-post-comment'
import { followPost } from './follow-post'
import {
  generateAIDateRanges,
  regenerateDateMidpoints,
} from './generate-ai-date-ranges'
import {
  generateAINumericRanges,
  regenerateNumericMidpoints,
} from './generate-ai-numeric-ranges'
import { generateConciseTitle } from './generate-concise-title'
import { getCloseDateEndpoint } from './get-close-date'
import {
  getContractOptionVoters,
  getContractVoters,
} from './get-contract-voters'
import { getMarketProps } from './get-market-props'
import { getPosts } from './get-posts'
import { getReactions } from './get-reactions'
import { getSeasonInfo } from './get-season-info'
import { getSiteActivity } from './get-site-activity'
import { getSportsGames } from './get-sports-games'
import { getUserContractMetricsWithContracts } from './get-user-contract-metrics-with-contracts'
import { getUserLastActiveTime } from './get-user-last-active-time'
import { inferNumericUnit } from './infer-numeric-unit'
import { isSportsInterested } from './is-sports-bettor'
import { markNotificationRead } from './mark-all-notifications'
import { markallnotificationsnew } from './mark-all-notifications-new'
import {
  deleteMarketDraft,
  getMarketDrafts,
  saveMarketDraft,
} from './market-drafts'
import { purchaseContractBoost } from './purchase-boost'
import { referUser } from './refer-user'
import { updatePost } from './update-post'
import { validateiap } from './validate-iap'

export const handlers: { [k in APIPath]: APIHandler<k> } = {
  'refresh-all-clients': refreshAllClients,
  bet: placeBet,
  'multi-bet': placeMultiBet,
  'follow-contract': followContract,
  'bet/cancel/:betId': cancelBet,
  'market/:contractId/sell': sellShares,
  bets: getBets,
  'bet-points': getBetPointsBetween,
  'get-notifications': getNotifications,
  'get-channel-memberships': getChannelMemberships,
  'get-channel-messages': getChannelMessages,
  'get-channel-seen-time': getLastSeenChannelTime,
  'set-channel-seen-time': setChannelLastSeenTime,
  'get-contract': getContract,
  comment: createComment,
  'comment-threads': getContractCommentThreads,
  'comment-thread': getCommentThread,
  'hide-comment': hideComment,
  'pin-comment': pinComment,
  comments: getComments,
  market: createMarket,
  'market/:contractId/group': addOrRemoveTopicFromContract,
  'market/:contractId/groups': getContractTopics,
  'group/:slug': getGroup,
  'group/by-id/:id': getGroup,
  'group/by-id/:id/markets': ({ id, limit }, ...rest) =>
    getMarkets({ groupId: id, limit }, ...rest),
  'group/:slug/delete': deleteGroup,
  'group/by-id/:id/delete': deleteGroup,
  'group/:slug/block': blockGroup,
  'group/:slug/unblock': unblockGroup,
  'group/by-id/:topId/group/:bottomId': addOrRemoveTopicFromTopic,
  'group/:slug/groups': getTopicTopics,
  'group/:slug/dashboards': getTopicDashboards,
  'group/by-id/:id/groups': getTopicTopics,
  groups: getGroups,
  'market/:id': getMarket,
  'market/:id/lite': ({ id }) => getMarket({ id, lite: true }),
  'market/:id/prob': getMarketProb,
  'market-probs': getMarketProbs,
  'answer/:answerId': getSingleAnswer,
  'market/:contractId/answers': getContractAnswers,
  'markets-by-ids': getMarketsByIds,
  'slug/:slug': getMarket,
  'market/:contractId/update': updateMarket,
  'market/:contractId/close': closeMarket,
  'market/:contractId/resolve': resolveMarket,
  'market/:contractId/add-liquidity': addLiquidity,
  'market/:contractId/remove-liquidity': removeLiquidity,
  'market/:contractId/add-bounty': addBounty,
  'market/:contractId/award-bounty': awardBounty,
  'market/:contractId/answer': createAnswerCPMM,
  'market/:contractId/block': blockMarket,
  'market/:contractId/unblock': unblockMarket,
  'get-user-limit-orders-with-contracts': getUserLimitOrdersWithContracts,
  'get-interesting-groups-from-views': getInterestingGroupsFromViews,
  leagues: getLeagues,
  markets: getMarkets,
  'search-markets': searchMarketsLite,
  'search-markets-full': searchMarketsFull,
  managram: managram,
  managrams: getManagrams,
  manalink: createManalink,
  donate: donate,
  'convert-cash-to-mana': convertCashToMana,
  'convert-sp-to-mana': convertSpiceToMana,
  'market/:id/positions': getPositions,
  me: getMe,
  'me/update': updateMe,
  'me/delete': deleteMe,
  'me/private': getCurrentPrivateUser,
  'me/private/update': updatePrivateUser,
  'user/by-id/:id': getUser,
  'user/by-id/:id/lite': getLiteUser,
  'user/:username': getUser,
  'user/:username/lite': getLiteUser,
  'user/:username/bets': (...props) => getBets(...props),
  'user/by-id/:id/block': blockUser,
  'user/by-id/:id/unblock': unblockUser,
  users: getUsers,
  'users/by-id': getUsersByIds,
  'users/by-id/balance': getUserBalancesByIds,
  'search-users': searchUsers,
  react: addOrRemoveReaction,
  'save-twitch': saveTwitchCredentials,
  'set-push-token': setPushToken,
  'update-notif-settings': updateNotifSettings,
  headlines: getHeadlines,
  'politics-headlines': getPoliticsHeadlines,
  post: post,
  'fetch-link-preview': fetchLinkPreview,
  'request-loan': requestLoan,
  'get-related-markets': getRelatedMarkets,
  'get-related-markets-by-group': getRelatedMarketsByGroup,
  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,
  'get-boost-analytics': getBoostAnalytics,
  'set-news': setnews,
  'search-groups': searchGroups,
  'search-my-groups': searchMyGroups,
  'get-groups-with-top-contracts': getGroupsWithTopContracts,
  'get-balance-changes': getBalanceChanges,
  'get-partner-stats': getPartnerStats,
  'get-posts': getPosts,
  'get-seen-market-ids': getSeenMarketIds,
  'record-contract-view': recordContractView,
  'get-dashboard-from-slug': getDashboardFromSlug,
  'create-public-chat-message': createPublicChatMessage,
  unresolve: unresolve,
  'get-followed-groups': getFollowedGroups,
  'unique-bet-group-count': getUniqueBetGroupCount,
  'record-contract-interaction': recordContractInteraction,
  'get-user-portfolio': getUserPortfolio,
  'get-user-portfolio-history': getUserPortfolioHistory,
  createuser: createuser,
  'verify-phone-number': verifyPhoneNumber,
  'request-otp': requestOTP,
  'multi-sell': multiSell,
  'get-feed': getFeed,
  'get-mana-supply': getManaSupply,
  'update-mod-report': updateModReport,
  'get-mod-reports': getModReports,
  'search-contract-positions': searchContractPositions,
  'get-txn-summary-stats': getTxnSummaryStats,
  'get-mana-summary-stats': getManaSummaryStats,
  'register-gidx': register,
  'get-checkout-session-gidx': getCheckoutSession,
  'complete-checkout-session-gidx': completeCheckoutSession,
  'complete-cashout-session-gidx': completeCashoutSession,
  'complete-cashout-request': completeCashoutRequest,
  'get-verification-status-gidx': getVerificationStatus,
  'upload-document-gidx': uploadDocument,
  'get-verification-documents-gidx': getVerificationDocuments,
  'get-monitor-status-gidx': getMonitorStatus,
  'get-best-comments': getBestComments,
  'record-comment-view': recordCommentView,
  'get-cashouts': getCashouts,
  txns: getTxns,
  'toggle-system-trading-status': toggleSystemTradingStatus,
  leaderboard: getLeaderboard,
  'get-daily-changed-metrics-and-contracts': getDailyChangedMetricsAndContracts,
  'generate-ai-market-suggestions': generateAIMarketSuggestions,
  'generate-ai-description': generateAIDescription,
  'generate-ai-answers': generateAIAnswers,
  'get-monthly-bets-2024': getmonthlybets2024,
  'get-max-min-profit-2024': getmaxminprofit2024,
  'get-next-loan-amount': getNextLoanAmount,
  'check-sports-event': checkSportsEvent,
  'create-task': createTask,
  'update-task': updateTask,
  'create-category': createCategory,
  'get-categories': getCategories,
  'update-category': updateCategory,
  'get-tasks': getTasks,
  'get-site-activity': getSiteActivity,
  'is-sports-interested': isSportsInterested,
  'get-sports-games': getSportsGames,
  'get-market-props': getMarketProps,
  'get-user-contract-metrics-with-contracts':
    getUserContractMetricsWithContracts,
  validateIap: validateiap,
  'comment-reactions': getReactions,
  'mark-all-notifications-new': markallnotificationsnew,
  'get-contract-voters': getContractVoters,
  'get-contract-option-voters': getContractOptionVoters,
  'purchase-boost': purchaseContractBoost,
  'generate-ai-numeric-ranges': generateAINumericRanges,
  'regenerate-numeric-midpoints': regenerateNumericMidpoints,
  'infer-numeric-unit': inferNumericUnit,
  'generate-ai-date-ranges': generateAIDateRanges,
  'regenerate-date-midpoints': regenerateDateMidpoints,
  'generate-concise-title': generateConciseTitle,
  'get-close-date': getCloseDateEndpoint,
  'refer-user': referUser,
  'create-post-comment': createPostComment,
  'create-post': createPost,
  'update-post': updatePost,
  'update-post-comment': updatePostComment,
  'save-market-draft': saveMarketDraft,
  'get-market-drafts': getMarketDrafts,
  'delete-market-draft': deleteMarketDraft,
  'get-season-info': getSeasonInfo,
  'mark-notification-read': markNotificationRead,
  'dismiss-user-report': dismissUserReport,
  'follow-post': followPost,
  'edit-post-comment': editPostComment,
  'user-comments': getUserComments,
  'get-user-last-active-time': getUserLastActiveTime,
} as const
