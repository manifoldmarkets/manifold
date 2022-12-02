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
export * from './update-stats'
export * from './backup-db'
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
export * from './on-update-like'
export * from './weekly-portfolio-emails'
export * from './drizzle-liquidity'
export * from './check-push-notification-receipts'
export * from './replication/transaction-log'

// v2
export * from './health'
export * from './transact'
export * from './change-user-info'
export * from './create-user'
export * from './create-answer'
export * from './place-bet'
export * from './cancel-bet'
export * from './sell-bet'
export * from './sell-shares'
export * from './claim-manalink'
export * from './create-market'
export * from './create-group'
export * from './resolve-market'
export * from './unsubscribe'
export * from './stripe'
export * from './mana-signup-bonus'
export * from './close-market'
export * from './update-comment-bounty'
export * from './add-subsidy'
export * from './test-scheduled-function'
export * from './validate-iap'

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
import { addcommentbounty, awardcommentbounty } from './update-comment-bounty'
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
import { addsubsidy } from './add-subsidy'
import { testscheduledfunction } from './test-scheduled-function'
import { validateiap } from './validate-iap'

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
const addCommentBounty = toCloudFunction(addcommentbounty)
const createCommentFunction = toCloudFunction(createcomment)
const awardCommentBounty = toCloudFunction(awardcommentbounty)
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
const validateIAPFunction = toCloudFunction(validateiap)

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
  addCommentBounty as addcommentbounty,
  awardCommentBounty as awardcommentbounty,
  testScheduledFunction as testscheduledfunction,
  updateContractMetricsFunction as updatecontractmetrics,
  updateUserMetricsFunction as updateusermetrics,
  updateGroupMetricsFunction as updategroupmetrics,
  updateLoansFunction as updateloans,
  validateIAPFunction as validateiap,
}
