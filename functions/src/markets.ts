import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getValues } from './utils'
import { Contract } from '../../common/contract'
import { getProbability } from '../../common/calculate'

const cache = { lastUpdated: 0, data: '' }

export const markets = functions
  .runWith({ minInstances: 1 })
  .https.onRequest(async (req, res) => {
    const contracts: Contract[] = await getValues(
      firestore.collection('contracts').orderBy('volume24Hours', 'desc')
    )

    if (!cache.data || Date.now() - cache.lastUpdated > 120 * 1000) {
      const contractsInfo = contracts.map(getContractInfo)
      cache.data = JSON.stringify(contractsInfo)
      cache.lastUpdated = Date.now()
    }

    res.status(200).send(cache.data)
  })

const getContractInfo = ({
  creatorUsername,
  creatorName,
  createdTime,
  closeTime,
  question,
  description,
  slug,
  pool,
  totalShares,
  volume7Days,
  volume24Hours,
  isResolved,
  resolution,
}: Contract) => {
  return {
    creatorUsername,
    creatorName,
    createdTime,
    closeTime,
    question,
    description,
    url: `https://manifold.markets/${creatorUsername}/${slug}`,
    pool: pool.YES + pool.NO,
    probability: getProbability(totalShares),
    volume7Days,
    volume24Hours,
    isResolved,
    resolution,
  }
}

const firestore = admin.firestore()
