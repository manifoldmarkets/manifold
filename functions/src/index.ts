import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { EndpointDefinition } from './api'

admin.initializeApp()

// v1
export * from './on-create-bet'
export * from './on-create-comment-on-contract'
export * from './on-view'
export * from './update-metrics'
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
export * from './on-create-group'
export * from './on-update-user'
export * from './on-create-comment-on-group'
export * from './on-create-txn'
export * from './on-delete-group'
export * from './score-contracts'

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
import { createmarket } from './create-contract'
import { addliquidity } from './add-liquidity'
import { withdrawliquidity } from './withdraw-liquidity'
import { creategroup } from './create-group'
import { resolvemarket } from './resolve-market'
import { unsubscribe } from './unsubscribe'
import { stripewebhook, createcheckoutsession } from './stripe'

const toCloudFunction = ({ opts, handler }: EndpointDefinition) => {
  onRequest(opts, handler as any)
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
const addLiquidityFunction = toCloudFunction(addliquidity)
const withdrawLiquidityFunction = toCloudFunction(withdrawliquidity)
const createGroupFunction = toCloudFunction(creategroup)
const resolveMarketFunction = toCloudFunction(resolvemarket)
const unsubscribeFunction = toCloudFunction(unsubscribe)
const stripeWebhookFunction = toCloudFunction(stripewebhook)
const createCheckoutSessionFunction = toCloudFunction(createcheckoutsession)

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
  addLiquidityFunction as addliquidity,
  withdrawLiquidityFunction as withdrawliquidity,
  createGroupFunction as creategroup,
  resolveMarketFunction as resolvemarket,
  unsubscribeFunction as unsubscribe,
  stripeWebhookFunction as stripewebhook,
  createCheckoutSessionFunction as createcheckoutsession,
}
