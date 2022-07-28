import { APIError, newEndpoint } from './api'
import { isProd, log } from './utils'
import * as admin from 'firebase-admin'
import { PrivateUser, User } from '../../common/user'
import { runTxn, TxnData } from './transact'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from '../../common/antes'

// sandbox
const API_KEY = 'TEST_k-dOX64gXbmZgaaPgbb_7aP6jhI-iXae_mASnHedTvQ'
const FUNDING_ID = 'Y46Z09MJBQXY'
const CAMPAIGN_ID = 'DVFR42FR12KO'

// prod
// const FUNDING_ID = ''
// const CAMPAIGN_ID = 'T5436LGG2KP6'

const firestore = admin.firestore()
const amount = 7500
const opts = { secrets: ['TREMENDOUS_TEST_KEY'] }

export const convertmana = newEndpoint(opts, async (req, auth) => {
  const result = await firestore.runTransaction(async (trans) => {
    log('Inside main transaction.')
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const privateUserDoc = firestore.doc(`private-users/${auth.uid}`)
    const userSnap = await trans.get(userDoc)
    const privateSnap = await trans.get(privateUserDoc)

    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    if (!privateSnap.exists) throw new APIError(400, 'Private user not found.')
    log('Loaded user snapshot.')

    const user = userSnap.data() as User
    const privateUser = privateSnap.data() as PrivateUser
    if (user.balance < amount) throw new APIError(400, 'Insufficient balance.')
    // Actually execute the txn
    const data: TxnData = {
      fromId: auth.uid,
      fromType: 'USER',
      toId: isProd()
        ? HOUSE_LIQUIDITY_PROVIDER_ID
        : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
      toType: 'BANK',
      amount,
      token: 'M$',
      category: 'PURCHASE',
      description: `${auth.uid} redeemed ${amount} mana for a gift card.`,
    }
    const result = await runTxn(trans, data)
    const txnId = result.txn?.id
    if (!txnId) {
      throw new APIError(
        500,
        result.message ?? 'An error occurred posting the transaction.'
      )
    }
    log('sending gift card to:', privateUser.email)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Tremendous = require('tremendous')
    // TODO: this isn't working
    // const apiKey = process.env.TREMENDOUS_TEST_KEY as string
    const apiKey = API_KEY
    log('apiKey:', apiKey)

    // Sandbox environment
    const client = new Tremendous(
      apiKey,
      'https://testflight.tremendous.com/api/v2/'
    )
    const order_data = {
      payment: {
        funding_source_id: FUNDING_ID,
      },
      reward: {
        value: {
          denomination: 50,
          currency_code: 'USD',
        },
        campaign_id: CAMPAIGN_ID,
        delivery: {
          method: 'EMAIL',
        },
        recipient: {
          name: user.name,
          email: privateUser.email,
        },
      },
    }

    client.createOrder(order_data, function (err: any, results: any) {
      log(JSON.stringify(err, null, 2))
      log(JSON.stringify(results, null, 2))
    })
    return txnId
  })
  return { message: 'success', txnId: result }
})
