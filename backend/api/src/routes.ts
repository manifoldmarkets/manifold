import { updateMe } from './update-me'
import { placeBet } from './place-bet'
import { cancelBet } from './cancel-bet'
import { sellShares } from './sell-shares'
import { createMarket } from './create-market'
import { createComment } from './create-comment'
import { resolveMarket } from './resolve-market'
import { closeMarket } from './close-market'
import { saveTwitchCredentials } from './save-twitch-credentials'
import { addLiquidity } from './add-liquidity'
import { removeLiquidity } from './remove-liquidity'
import { awardBounty } from './award-bounty'
import { addBounty } from './add-bounty'
import { createAnswerCPMM } from './create-answer-cpmm'
import { managram } from './managram'
import { setnews } from './set-news'
import { unresolve } from './unresolve'
import { updateMarket } from 'api/update-market'
import { getCompatibleLovers } from './love/compatible-lovers'
import { type APIPath } from 'common/api/schema'
import { hideComment } from './hide-comment'
import { pinComment } from './pin-comment'
import { getLeagues } from './get-leagues'
import { addOrRemoveTopicFromContract } from './add-topic-to-market'
import { post } from 'api/post'
import { fetchLinkPreview } from './fetch-link-preview'
import { type APIHandler } from './helpers/endpoint'
import { requestloan } from 'api/request-loan'
import { removePinnedPhoto } from './love/remove-pinned-photo'
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
import { getLoverAnswers } from './love/get-lover-answers'
import { placeMultiBet } from 'api/place-multi-bet'
import { getPartnerStats } from './get-partner-stats'
import { getSeenMarketIds } from 'api/get-seen-market-ids'
import { recordContractView } from 'api/record-contract-view'
import { createPublicChatMessage } from 'api/create-public-chat-message'
import { getUniqueBetGroupCount } from 'api/get-unique-bet-groups'
import { deleteGroup } from './delete-group'
import { recordContractInteraction } from 'api/record-contract-interaction'
import { createuser } from 'api/create-user'
import { verifyPhoneNumber } from 'api/verify-phone-number'
import { requestOTP } from 'api/request-phone-otp'
import { multiSell } from 'api/multi-sell'
import { convertCashToMana } from './convert-cash-to-mana'
import { convertSpiceToMana } from './convert-sp-to-mana'
import { donate } from './donate'
import { getManaSupply } from './get-mana-supply'
import { deleteMe } from './delete-me'
import { updateModReport } from './update-mod-report'
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
import { updatePrivateUser } from './update-private-user'
import { setPushToken } from './push-token'
import { updateNotifSettings } from './update-notif-settings'
import { createCashContract } from './create-cash-contract'
import { getVerificationDocuments } from 'api/gidx/get-verification-documents'
import { getRedeemablePrizeCash } from './get-redeemable-prize-cash'
import { getTotalRedeemablePrizeCash } from './get-total-redeemable-prize-cash'
import { getMonitorStatus } from 'api/gidx/get-monitor-status'
import { recordCommentView } from 'api/record-comment-view'
import {
  getChannelMemberships,
  getChannelMessages,
  getLastSeenChannelTime,
  setChannelLastSeenTime,
} from 'api/get-private-messages'
import { getCheckoutSession } from 'api/gidx/get-checkout-session'
import { completeCheckoutSession } from 'api/gidx/complete-checkout-session'
import { followContract } from './follow-contract'
import { getInterestingGroupsFromViews } from 'api/get-interesting-groups-from-views'
import { completeCashoutSession } from 'api/gidx/complete-cashout-session'
import { getCashouts } from './get-cashouts'
import { getKYCStats } from './get-kyc-stats'
import { refreshAllClients } from './refresh-all-clients'
import { getLeaderboard } from './get-leaderboard'
import { toggleSystemTradingStatus } from './toggle-system-status'
import { completeCashoutRequest } from './gidx/complete-cashout-request'
import { health } from './health'

export const handlers: { [k in APIPath]?: APIHandler<k> } = {
  health: health,
  'refresh-all-clients': refreshAllClients,
  'create-cash-contract': createCashContract,
  bet: placeBet,
  'multi-bet': placeMultiBet,
  'follow-contract': followContract,
  'bet/cancel/:betId': cancelBet,
  'market/:contractId/sell': sellShares,
  'get-channel-memberships': getChannelMemberships,
  'get-channel-messages': getChannelMessages,
  'get-channel-seen-time': getLastSeenChannelTime,
  'set-channel-seen-time': setChannelLastSeenTime,
  comment: createComment,
  'hide-comment': hideComment,
  'pin-comment': pinComment,
  market: createMarket,
  'market/:contractId/group': addOrRemoveTopicFromContract,
  'group/:slug/delete': deleteGroup,
  'group/by-id/:id/delete': deleteGroup,
  'group/:slug/block': blockGroup,
  'group/:slug/unblock': unblockGroup,
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
  'get-interesting-groups-from-views': getInterestingGroupsFromViews,
  managram: managram,
  manalink: createManalink,
  donate: donate,
  'convert-cash-to-mana': convertCashToMana,
  'convert-sp-to-mana': convertSpiceToMana,
  'me/update': updateMe,
  'me/delete': deleteMe,
  'me/private/update': updatePrivateUser,
  'user/by-id/:id/block': blockUser,
  'user/by-id/:id/unblock': unblockUser,
  react: addOrRemoveReaction,
  'save-twitch': saveTwitchCredentials,
  'set-push-token': setPushToken,
  'update-notif-settings': updateNotifSettings,
  'compatible-lovers': getCompatibleLovers,
  post: post,
  'fetch-link-preview': fetchLinkPreview,
  'request-loan': requestloan,
  'remove-pinned-photo': removePinnedPhoto,
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
  'get-partner-stats': getPartnerStats,
  'get-seen-market-ids': getSeenMarketIds,
  'record-contract-view': recordContractView,
  'create-public-chat-message': createPublicChatMessage,
  unresolve: unresolve,
  'unique-bet-group-count': getUniqueBetGroupCount,
  'record-contract-interaction': recordContractInteraction,
  createuser: createuser,
  'verify-phone-number': verifyPhoneNumber,
  'request-otp': requestOTP,
  'multi-sell': multiSell,
  'get-mana-supply': getManaSupply,
  'update-mod-report': updateModReport,
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
  'record-comment-view': recordCommentView,
  'get-cashouts': getCashouts,
  'get-kyc-stats': getKYCStats,
  'toggle-system-trading-status': toggleSystemTradingStatus,
  leaderboard: getLeaderboard,
}
