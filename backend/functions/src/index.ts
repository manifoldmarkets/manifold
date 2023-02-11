import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { EndpointDefinition } from './api/helpers'

admin.initializeApp()

// triggers
export * from './triggers/log-writes'
export * from './triggers/on-create-user'
export * from './triggers/on-create-bet'
export * from './triggers/on-create-comment-on-contract'
export * from './triggers/on-create-comment-on-post'
export * from './triggers/on-create-answer'
export * from './triggers/on-update-contract'
export * from './triggers/on-create-contract'
export * from './triggers/on-follow-user'
export * from './triggers/on-unfollow-user'
export * from './triggers/on-create-liquidity-provision'
export * from './triggers/on-update-group'
export * from './triggers/on-create-txn'
export * from './triggers/on-delete-group'
export * from './triggers/on-update-reaction'
export * from './triggers/on-update-contract-follow'

// scheduled functions
export { scheduleUpdateContractMetrics } from './scheduled/update-contract-metrics'
export { scheduleUpdateUserMetrics } from './scheduled/update-user-metrics'
export { scheduleUpdateGroupMetrics } from './scheduled/update-group-metrics'
export { scheduleUpdateLoans } from './scheduled/update-loans'
export { scheduleUpdateRecommended } from './scheduled/update-recommended'
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './scheduled/weekly-portfolio-updates'
export * from './scheduled/update-stats'
export * from './scheduled/backup-db'
export * from './scheduled/mana-signup-bonus'
export * from './scheduled/market-close-notifications'
export * from './scheduled/score-contracts'
export * from './scheduled/weekly-markets-emails'
export * from './scheduled/reset-betting-streaks'
export * from './scheduled/reset-weekly-emails-flags'
export * from './scheduled/weekly-portfolio-emails'
export * from './scheduled/drizzle-liquidity'
export * from './scheduled/check-push-notification-receipts'
export * from './scheduled/increment-streak-forgiveness'

// HTTP endpoints
import { health } from './api/health'
import { transact } from './api/transact'
import { changeuserinfo } from './api/change-user-info'
import { createuser } from './api/create-user'
import { createanswer } from './api/create-answer'
import { placebet } from './api/place-bet'
import { cancelbet } from './api/cancel-bet'
import { sellbet } from './api/sell-bet'
import { sellshares } from './api/sell-shares'
import { claimmanalink } from './api/claim-manalink'
import { createmarket } from './api/create-market'
import { createcomment } from './api/create-comment'
import { creategroup } from './api/create-group'
import { resolvemarket } from './api/resolve-market'
import { closemarket } from './api/close-market'
import { unsubscribe } from './api/unsubscribe'
import { stripewebhook, createcheckoutsession } from './api/stripe'
import { getcurrentuser } from './api/get-current-user'
import { acceptchallenge } from './api/accept-challenge'
import { createpost } from './api/create-post'
import { savetwitchcredentials } from './api/save-twitch-credentials'
import { updatecontractmetrics } from './scheduled/update-contract-metrics'
import { updateusermetrics } from './scheduled/update-user-metrics'
import { updategroupmetrics } from './scheduled/update-group-metrics'
import { updateloans } from './scheduled/update-loans'
import { updaterecommended } from './scheduled/update-recommended'
import { addsubsidy } from './api/add-subsidy'
import { testscheduledfunction } from './api/test-scheduled-function'
import { validateiap } from './api/validate-iap'
import { swapcert } from './api/swap-cert'
import { dividendcert } from './api/dividend-cert'
import { markallnotifications } from './api/mark-all-notifications'
import { claimdestinysub } from './api/claim-destiny-sub'
import { addcontracttogroup } from './api/add-contract-to-group'
import { updatememberrole } from './api/update-group-member-role'
import { removecontractfromgroup } from './api/remove-contract-from-group'

const toCloudFunction = ({ opts, handler }: EndpointDefinition) => {
  return onRequest(opts, handler as any)
}
const healthFunction = toCloudFunction(health)
const transactFunction = toCloudFunction(transact)
const changeUserInfoFunction = toCloudFunction(changeuserinfo)
const createUserFunction = toCloudFunction(createuser)
const createAnswerFunction = toCloudFunction(createanswer)
const placeBetFunction = toCloudFunction(placebet)
const cancelBetFunction = toCloudFunction(cancelbet)
const sellBetFunction = toCloudFunction(sellbet)
const sellSharesFunction = toCloudFunction(sellshares)
const claimManalinkFunction = toCloudFunction(claimmanalink)
const createMarketFunction = toCloudFunction(createmarket)
const addSubsidyFunction = toCloudFunction(addsubsidy)
const createCommentFunction = toCloudFunction(createcomment)
const createGroupFunction = toCloudFunction(creategroup)
const resolveMarketFunction = toCloudFunction(resolvemarket)
const closeMarketFunction = toCloudFunction(closemarket)
const unsubscribeFunction = toCloudFunction(unsubscribe)
const stripeWebhookFunction = toCloudFunction(stripewebhook)
const createCheckoutSessionFunction = toCloudFunction(createcheckoutsession)
const getCurrentUserFunction = toCloudFunction(getcurrentuser)
const acceptChallenge = toCloudFunction(acceptchallenge)
const createPostFunction = toCloudFunction(createpost)
const saveTwitchCredentials = toCloudFunction(savetwitchcredentials)
const testScheduledFunction = toCloudFunction(testscheduledfunction)
const updateContractMetricsFunction = toCloudFunction(updatecontractmetrics)
const updateUserMetricsFunction = toCloudFunction(updateusermetrics)
const updateGroupMetricsFunction = toCloudFunction(updategroupmetrics)
const updateLoansFunction = toCloudFunction(updateloans)
const updateRecommendedFunction = toCloudFunction(updaterecommended)
const validateIAPFunction = toCloudFunction(validateiap)
const swapCertFunction = toCloudFunction(swapcert)
const dividendCertFunction = toCloudFunction(dividendcert)
const markAllNotificationsFunction = toCloudFunction(markallnotifications)
const claimDestinySubFunction = toCloudFunction(claimdestinysub)
const addContractToGroupFunction = toCloudFunction(addcontracttogroup)
const updateMemberRoleFunction = toCloudFunction(updatememberrole)
const removeContractFromGroupFunction = toCloudFunction(removecontractfromgroup)

export {
  healthFunction as health,
  transactFunction as transact,
  changeUserInfoFunction as changeuserinfo,
  createUserFunction as createuser,
  createAnswerFunction as createanswer,
  placeBetFunction as placebet,
  cancelBetFunction as cancelbet,
  sellBetFunction as sellbet,
  sellSharesFunction as sellshares,
  claimManalinkFunction as claimmanalink,
  createMarketFunction as createmarket,
  addSubsidyFunction as addsubsidy,
  createGroupFunction as creategroup,
  resolveMarketFunction as resolvemarket,
  closeMarketFunction as closemarket,
  unsubscribeFunction as unsubscribe,
  stripeWebhookFunction as stripewebhook,
  createCheckoutSessionFunction as createcheckoutsession,
  getCurrentUserFunction as getcurrentuser,
  acceptChallenge as acceptchallenge,
  createPostFunction as createpost,
  saveTwitchCredentials as savetwitchcredentials,
  createCommentFunction as createcomment,
  testScheduledFunction as testscheduledfunction,
  updateContractMetricsFunction as updatecontractmetrics,
  updateUserMetricsFunction as updateusermetrics,
  updateGroupMetricsFunction as updategroupmetrics,
  updateLoansFunction as updateloans,
  updateRecommendedFunction as updaterecommended,
  validateIAPFunction as validateiap,
  swapCertFunction as swapcert,
  dividendCertFunction as dividendcert,
  markAllNotificationsFunction as markallnotifications,
  claimDestinySubFunction as claimdestinysub,
  addContractToGroupFunction as addcontracttogroup,
  updateMemberRoleFunction as updatememberrole,
  removeContractFromGroupFunction as removecontractfromgroup,
}
