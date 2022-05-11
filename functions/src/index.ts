/* This use of module-alias hackily simulates the Typescript base URL so that
 * the Firebase deploy machinery, which just uses the compiled Javascript in the
 * lib directory, will be able to do imports from the root directory
 * (i.e. "common/foo" instead of "../../../common/foo") just like we can in
 * Typescript-land.
 *
 * Note that per the module-alias docs, this need to come before any other
 * imports in order to work.
 *
 * Suggested by https://github.com/firebase/firebase-tools/issues/986 where many
 * people complain about this problem.
 */
import { addPath } from 'module-alias'
addPath('./lib')

import * as admin from 'firebase-admin'
admin.initializeApp()

// export * from './keep-awake'
export * from './transact'
export * from './place-bet'
export * from './resolve-market'
export * from './stripe'
export * from './sell-bet'
export * from './sell-shares'
export * from './create-contract'
export * from './create-user'
export * from './create-fold'
export * from './create-answer'
export * from './on-create-bet'
export * from './on-create-comment'
export * from './on-fold-follow'
export * from './on-fold-delete'
export * from './on-view'
export * from './unsubscribe'
export * from './update-contract-metrics'
export * from './update-user-metrics'
export * from './update-recommendations'
export * from './update-feed'
export * from './backup-db'
export * from './change-user-info'
export * from './market-close-emails'
export * from './add-liquidity'
