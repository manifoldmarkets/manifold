import { updateMe } from './update-me'
import { placeBet } from './place-bet'
import { cancelBet } from './cancel-bet'
import { sellShares } from './sell-shares'
import { createMarket } from './create-market'
import { createComment } from './create-comment'
import { resolveMarket } from './resolve-market'
import { closeMarket } from './close-market'
import { getMe } from './get-me'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { addLiquidity } from './add-liquidity'
import { removeLiquidity } from './remove-liquidity'
import { searchGroups, searchMyGroups } from './search-groups'
import { awardBounty } from './award-bounty'
import { addBounty } from './add-bounty'
import { createAnswerCPMM } from './create-answer-cpmm'
import { managram } from './managram'
import { setnews } from './set-news'
import { getDashboardFromSlug } from './get-dashboard-from-slug'
import { unresolve } from './unresolve'
import { updateMarket } from 'api/update-market'
import { getCompatibleLovers } from './love/compatible-lovers'
import { type APIPath } from 'common/api/schema'
import { getMarkets } from 'api/markets'
import { hideComment } from './hide-comment'
import { pinComment } from './pin-comment'
import { getManagrams } from './get-managrams'
import { getGroups } from './get-groups'
import { getComments } from './get-comments'
import { getBets } from './get-bets'
import { getLiteUser, getUser } from './get-user'
import { getUsers } from './get-users'
import { getMarket } from './get-market'
import { getGroup } from './get-group'
import { getPositions } from './get-positions'
import { getLeagues } from './get-leagues'
import { getContract } from './get-contract'
import { getSingleAnswer } from './get-answer'
import { getContractAnswers } from './get-contract-answers'
import { addOrRemoveTopicFromContract } from './add-topic-to-market'
import { addOrRemoveTopicFromTopic } from './add-topic-to-topic'
import { searchUsers } from './search-users'
import { searchMarketsLite, searchMarketsFull } from './search-contracts'
import { post } from 'api/post'
import { fetchLinkPreview } from './fetch-link-preview'
import { type APIHandler } from './helpers/endpoint'
import { requestloan } from 'api/request-loan'
import { removePinnedPhoto } from './love/remove-pinned-photo'
import { getHeadlines, getPoliticsHeadlines } from './get-headlines'
import { getadanalytics } from 'api/get-ad-analytics'
import { getCompatibilityQuestions } from './love/get-compatibililty-questions'
import { addOrRemoveReaction } from './reaction'
import { likeLover } from './love/like-lover'
import { shipLovers } from './love/ship-lovers'
import { createManalink } from './create-manalink'
import { getLikesAndShips } from './love/get-likes-and-ships'
import { hasFreeLike } from './love/has-free-like'
import { starLover } from './love/star-lover'
import { getLovers } from './love/get-lovers'
import { unlistAndCancelUserContracts } from './unlist-and-cancel-user-contracts'
import { getGroupsWithTopContracts } from 'api/get-topics-with-markets'
import { getBalanceChanges } from 'api/get-balance-changes'
import { getLoverAnswers } from './love/get-lover-answers'
import { placeMultiBet } from 'api/place-multi-bet'
import { getPartnerStats } from './get-partner-stats'
import { getSeenMarketIds } from 'api/get-seen-market-ids'
import { recordContractView } from 'api/record-contract-view'
import { createPublicChatMessage } from 'api/create-public-chat-message'
import { getFollowedGroups } from './get-followed-groups'
import { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'
import { deleteGroup } from './delete-group'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { getUserPortfolio } from './get-user-portfolio'
import { createuser } from 'api/create-user'
import { verifyPhoneNumber } from 'api/verify-phone-number'
import { requestOTP } from 'api/request-phone-otp'
import { multiSell } from 'api/multi-sell'
import { convertCashToMana } from './convert-cash-to-mana'
import { convertSpiceToMana } from './convert-sp-to-mana'
import { donate } from './donate'
import { getFeed } from 'api/get-feed'
import { getManaSupply } from './get-mana-supply'
import { getUserPortfolioHistory } from './get-user-portfolio-history'
import { deleteMe } from './delete-me'
import { updateModReport } from './update-mod-report'
import { getModReports } from './get-mod-reports'
import { searchContractPositions } from 'api/search-contract-positions'
import { blockUser, unblockUser } from './block-user'
import { blockGroup, unblockGroup } from './block-group'
import { blockMarket, unblockMarket } from './block-market'
import { getTxnSummaryStats } from 'api/get-txn-summary-stats'
import { getManaSummaryStats } from 'api/get-mana-summary-stats'
import { register } from 'api/gidx/register'
import { uploadDocument } from 'api/gidx/upload-document'
import { identityCallbackGIDX, paymentCallbackGIDX } from 'api/gidx/callback'
import { getVerificationStatus } from 'api/gidx/get-verification-status'
import { getCurrentPrivateUser } from './get-current-private-user'
import { updatePrivateUser } from './update-private-user'
import { setPushToken } from './push-token'
import { updateNotifSettings } from './update-notif-settings'
import { createCashContract } from './create-cash-contract'
import { getVerificationDocuments } from 'api/gidx/get-verification-documents'
import { getRedeemablePrizeCash } from './get-redeemable-prize-cash'
import { getTotalRedeemablePrizeCash } from './get-total-redeemable-prize-cash'
import { getMonitorStatus } from 'api/gidx/get-monitor-status'
import { getBestComments } from 'api/get-best-comments'
import { recordCommentView } from 'api/record-comment-view'
import {
  getChannelMemberships,
  getChannelMessages,
  getLastSeenChannelTime,
  setChannelLastSeenTime,
} from 'api/get-private-messages'
import { getNotifications } from 'api/get-notifications'
import { getCheckoutSession } from 'api/gidx/get-checkout-session'
import { completeCheckoutSession } from 'api/gidx/complete-checkout-session'
import { getContractTopics } from './get-contract-topics'
import { getRelatedMarkets } from 'api/get-related-markets'
import { getRelatedMarketsByGroup } from './get-related-markets-by-group'
import { followContract } from './follow-contract'
import { getUserLimitOrdersWithContracts } from 'api/get-user-limit-orders-with-contracts'
import { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'
import { completeCashoutSession } from 'api/gidx/complete-cashout-session'
import { getCashouts } from './get-cashouts'
import { getKYCStats } from './get-kyc-stats'
import { getTxns } from './get-txns'
import { refreshAllClients } from './refresh-all-clients'
import { getLeaderboard } from './get-leaderboard'
import { toggleSystemTradingStatus } from './toggle-system-status'
import { completeCashoutRequest } from './gidx/complete-cashout-request'
import { getDailyChangedMetricsAndContracts } from './get-daily-changed-metrics-and-contracts'
import { getMarketsByIds } from './get-markets'
import { getTopicTopics } from './get-topic-topics'
import { getTopicDashboards } from './get-topic-dashboards'
import { generateAIMarketSuggestions } from './generate-ai-market-suggestions'
import { generateAIMarketSuggestions2 } from './generate-ai-market-suggestions-2'
import { generateAIDescription } from './generate-ai-description'
import { generateAIAnswers } from './generate-ai-answers'
import { getNextLoanAmount } from './get-next-loan-amount'

// we define the handlers in this object in order to typecheck that every API has a handler
export const handlers: { [k in APIPath]: APIHandler<k> } = {
  'refresh-all-clients': refreshAllClients,
  'create-cash-contract': createCashContract,
  bet: placeBet,
  'multi-bet': placeMultiBet,
  'follow-contract': followContract,
  'bet/cancel/:betId': cancelBet,
  'market/:contractId/sell': sellShares,
  bets: getBets,
  'get-notifications': getNotifications,
  'get-channel-memberships': getChannelMemberships,
  'get-channel-messages': getChannelMessages,
  'get-channel-seen-time': getLastSeenChannelTime,
  'set-channel-seen-time': setChannelLastSeenTime,
  'get-contract': getContract,
  comment: createComment,
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
  'search-users': searchUsers,
  react: addOrRemoveReaction,
  'save-twitch': saveTwitchCredentials,
  'set-push-token': setPushToken,
  'update-notif-settings': updateNotifSettings,
  headlines: getHeadlines,
  'politics-headlines': getPoliticsHeadlines,
  'compatible-lovers': getCompatibleLovers,
  post: post,
  'fetch-link-preview': fetchLinkPreview,
  'request-loan': requestloan,
  'remove-pinned-photo': removePinnedPhoto,
  'get-related-markets': getRelatedMarkets,
  'get-related-markets-by-group': getRelatedMarketsByGroup,
  'unlist-and-cancel-user-contracts': unlistAndCancelUserContracts,
  'get-ad-analytics': getadanalytics,
  'get-compatibility-questions': getCompatibilityQuestions,
  'like-lover': likeLover,
  'ship-lovers': shipLovers,
  'get-likes-and-ships': getLikesAndShips,
  'has-free-like': hasFreeLike,
  'star-lover': starLover,
  'get-lovers': getLovers,
  'get-lover-answers': getLoverAnswers,
  'set-news': setnews,
  'search-groups': searchGroups,
  'search-my-groups': searchMyGroups,
  'get-groups-with-top-contracts': getGroupsWithTopContracts,
  'get-balance-changes': getBalanceChanges,
  'get-partner-stats': getPartnerStats,
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
  'identity-callback-gidx': identityCallbackGIDX,
  'payment-callback-gidx': paymentCallbackGIDX,
  'get-verification-documents-gidx': getVerificationDocuments,
  'get-redeemable-prize-cash': getRedeemablePrizeCash,
  'get-total-redeemable-prize-cash': getTotalRedeemablePrizeCash,
  'get-monitor-status-gidx': getMonitorStatus,
  'get-best-comments': getBestComments,
  'record-comment-view': recordCommentView,
  'get-cashouts': getCashouts,
  'get-kyc-stats': getKYCStats,
  txns: getTxns,
  'toggle-system-trading-status': toggleSystemTradingStatus,
  leaderboard: getLeaderboard,
  'get-daily-changed-metrics-and-contracts': getDailyChangedMetricsAndContracts,
  'generate-ai-market-suggestions': generateAIMarketSuggestions,
  'generate-ai-market-suggestions-2': generateAIMarketSuggestions2,
  'generate-ai-description': generateAIDescription,
  'generate-ai-answers': generateAIAnswers,
  'get-next-loan-amount': getNextLoanAmount,
}
