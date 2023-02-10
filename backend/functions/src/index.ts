import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { EndpointDefinition } from './api'

admin.initializeApp()

// v1
export * from './on-create-user'
export * from './on-create-bet'
export * from './on-create-comment-on-contract'
export * from './on-create-comment-on-post'
export { scheduleUpdateContractMetrics } from './update-contract-metrics'
export { scheduleUpdateUserMetrics } from './update-user-metrics'
export { scheduleUpdateGroupMetrics } from './update-group-metrics'
export { scheduleUpdateLoans } from './update-loans'
export { scheduleUpdateRecommended } from './update-recommended'
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './weekly-portfolio-updates'
export * from './update-stats'
export * from './backup-db'
export * from './mana-signup-bonus'
export * from './market-close-notifications'
export * from './on-create-answer'
export * from './on-update-contract'
export * from './on-create-contract'
export * from './on-follow-user'
export * from './on-unfollow-user'
export * from './on-create-liquidity-provision'
export * from './on-update-group'
export * from './on-create-txn'
export * from './on-delete-group'
export * from './score-contracts'
export * from './weekly-markets-emails'
export * from './reset-betting-streaks'
export * from './reset-weekly-emails-flags'
export * from './on-update-contract-follow'
export * from './weekly-portfolio-emails'
export * from './drizzle-liquidity'
export * from './check-push-notification-receipts'
export * from './on-update-reaction'
export * from './log-writes'
export * from './increment-streak-forgiveness'

// v2
import { health } from './health'
import { transact } from './transact'
import { changeuserinfo } from './change-user-info'
import { createuser } from './create-user'
import { createanswer } from './create-answer'
import { placebet } from './place-bet'
import { cancelbet } from './cancel-bet'
import { sellbet } from './sell-bet'
import { sellshares } from './sell-shares'
import { claimmanalink } from './claim-manalink'
import { createmarket } from './create-market'
import { createcomment } from './create-comment'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { closemarket } from './close-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'
import { getcurrentuser } from './get-current-user'
import { acceptchallenge } from './accept-challenge'
import { createpost } from './create-post'
import { savetwitchcredentials } from './save-twitch-credentials'
import { updatecontractmetrics } from './update-contract-metrics'
import { updateusermetrics } from './update-user-metrics'
import { updategroupmetrics } from './update-group-metrics'
import { updateloans } from './update-loans'
import { updaterecommended } from './update-recommended'
import { addsubsidy } from './add-subsidy'
import { testscheduledfunction } from './test-scheduled-function'
import { validateiap } from './validate-iap'
import { swapcert } from './swap-cert'
import { dividendcert } from './dividend-cert'
import { markallnotifications } from './mark-all-notifications'
import { claimdestinysub } from './claim-destiny-sub'
import { addcontracttogroup } from './add-contract-to-group'
import { updatememberrole } from './update-group-member-role'
import { removecontractfromgroup } from './remove-contract-from-group'
import { updategroupprivacy } from './update-group-privacy'

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
const updateGroupPrivacyFunction = toCloudFunction(updategroupprivacy)

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
  updateGroupPrivacyFunction as updategroupprivacy,
}
