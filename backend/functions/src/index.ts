import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { EndpointDefinition } from './api/helpers'

admin.initializeApp()

// triggers
export * from './triggers/log-writes' // Running the emulator? Comment this line out
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
export * from './triggers/on-delete-group'
export * from './triggers/on-update-reaction'

// scheduled functions
export { scheduleUpdateLoans } from './scheduled/update-loans'
export { scheduleUpdateRecommended } from './scheduled/update-recommended'
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './scheduled/weekly-portfolio-updates'
export * from './scheduled/update-contract-metrics'
export * from './scheduled/update-user-metrics'
export * from './scheduled/update-group-metrics'
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

// v2
// HTTP endpoints
import { updateloans } from './scheduled/update-loans'
import { updaterecommended } from './scheduled/update-recommended'

const toCloudFunction = ({ opts, handler }: EndpointDefinition) => {
  return onRequest(opts, handler as any)
}
const updateLoansFunction = toCloudFunction(updateloans)
const updateRecommendedFunction = toCloudFunction(updaterecommended)

import * as endpoints from './api'

const healthFunction = toCloudFunction(endpoints.health)
const transactFunction = toCloudFunction(endpoints.transact)
const changeUserInfoFunction = toCloudFunction(endpoints.changeuserinfo)
const createUserFunction = toCloudFunction(endpoints.createuser)
const createAnswerFunction = toCloudFunction(endpoints.createanswer)
const placeBetFunction = toCloudFunction(endpoints.placebet)
const cancelBetFunction = toCloudFunction(endpoints.cancelbet)
const sellBetFunction = toCloudFunction(endpoints.sellbet)
const sellSharesFunction = toCloudFunction(endpoints.sellshares)
const claimManalinkFunction = toCloudFunction(endpoints.claimmanalink)
const createMarketFunction = toCloudFunction(endpoints.createmarket)
const addSubsidyFunction = toCloudFunction(endpoints.addsubsidy)
const createCommentFunction = toCloudFunction(endpoints.createcomment)
const createGroupFunction = toCloudFunction(endpoints.creategroup)
const resolveMarketFunction = toCloudFunction(endpoints.resolvemarket)
const closeMarketFunction = toCloudFunction(endpoints.closemarket)
const unsubscribeFunction = toCloudFunction(endpoints.unsubscribe)
const stripeWebhookFunction = toCloudFunction(endpoints.stripewebhook)
const createCheckoutSessionFunction = toCloudFunction(
  endpoints.createcheckoutsession
)
const getCurrentUserFunction = toCloudFunction(endpoints.getcurrentuser)
const createPostFunction = toCloudFunction(endpoints.createpost)
const saveTwitchCredentials = toCloudFunction(endpoints.savetwitchcredentials)
const testScheduledFunction = toCloudFunction(endpoints.testscheduledfunction)
const validateIAPFunction = toCloudFunction(endpoints.validateiap)
const swapCertFunction = toCloudFunction(endpoints.swapcert)
const dividendCertFunction = toCloudFunction(endpoints.dividendcert)
const markAllNotificationsFunction = toCloudFunction(
  endpoints.markallnotifications
)
const claimDestinySubFunction = toCloudFunction(endpoints.claimdestinysub)
const addContractToGroupFunction = toCloudFunction(endpoints.addcontracttogroup)
const updateMemberRoleFunction = toCloudFunction(endpoints.updatememberrole)
const removeContractFromGroupFunction = toCloudFunction(
  endpoints.removecontractfromgroup
)
const updateGroupPrivacyFunction = toCloudFunction(endpoints.updategroupprivacy)
const addGroupMemberFunction = toCloudFunction(endpoints.addgroupmember)
const registerDiscordId = toCloudFunction(endpoints.registerdiscordid)

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
  createPostFunction as createpost,
  saveTwitchCredentials as savetwitchcredentials,
  createCommentFunction as createcomment,
  testScheduledFunction as testscheduledfunction,
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
  addGroupMemberFunction as addgroupmember,
  registerDiscordId as registerdiscordid,
}
