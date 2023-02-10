import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { CollectionReference } from 'firebase-admin/firestore'
import { sumBy } from 'lodash'

import { getValues, invokeFunction, loadPaginated, log } from 'shared/utils'
import { Bet, LimitBet } from 'common/bet'
import { Contract, CPMM, CPMMContract } from 'common/contract'
import { DAY_MS } from 'common/util/time'
import { computeElasticity } from 'common/calculate-metrics'
import { getProbability } from 'common/calculate'
import { mapAsync } from 'common/util/promise'
import { hasChanges } from 'common/util/object'
import { newEndpointNoAuth } from './api'

const firestore = admin.firestore()
export const scheduleUpdateContractMetrics = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    try {
      console.log(await invokeFunction('updatecontractmetrics'))
    } catch (e) {
      console.error(e)
    }
  })

export const updatecontractmetrics = newEndpointNoAuth(
  { timeoutSeconds: 2000, memory: '8GiB', minInstances: 0 },
  async (_req) => {
    await updateContractMetrics()
    return { success: true }
  }
)

export async function updateContractMetrics() {
  log('Loading contracts...')
  const contracts = await loadPaginated(
    firestore.collection('contracts') as CollectionReference<Contract>
  )
  log(`Loaded ${contracts.length} contracts.`)

  log('Computing metric updates...')
  const now = Date.now()

  const writer = firestore.bulkWriter()
  await mapAsync(contracts, async (contract) => {
    const update = await computeContractMetricUpdates(contract, now)
    if (hasChanges(contract, update)) {
      const contractDoc = firestore.collection('contracts').doc(contract.id)
      writer.update(contractDoc, update)
    }
  })

  log('Committing writes...')
  await writer.close()
  log('Done.')
}

export const computeContractMetricUpdates = async (
  contract: Contract,
  now: number
) => {
  const yesterday = now - DAY_MS
  const weekAgo = now - 7 * DAY_MS
  const monthAgo = now - 30 * DAY_MS
  const yesterdayBets = await getValues<Bet>(
    firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('bets')
      .orderBy('createdTime', 'desc')
      .where('createdTime', '>=', yesterday)
      .where('isRedemption', '==', false)
      .where('isAnte', '==', false)
  )
  const unfilledBets = await getValues<LimitBet>(
    firestore
      .collection('contracts')
      .doc(contract.id)
      .collection('bets')
      .where('limitProb', '>', 0)
      .where('isFilled', '==', false)
      .where('isCancelled', '==', false)
  )

  let cpmmFields: Partial<CPMM> = {}
  if (contract.mechanism === 'cpmm-1') {
    cpmmFields = await computeProbChanges(
      contract,
      yesterday,
      weekAgo,
      monthAgo
    )
  }

  const [uniqueBettors24Hours, uniqueBettors7Days, uniqueBettors30Days] =
    await Promise.all(
      [yesterday, weekAgo, monthAgo].map((t) =>
        getUniqueBettors(contract.id, t)
      )
    )
  const isClosed = contract.closeTime && contract.closeTime < now

  return {
    volume24Hours: sumBy(yesterdayBets, (b) => Math.abs(b.amount)),
    elasticity: isClosed ? 0 : computeElasticity(unfilledBets, contract),
    uniqueBettors24Hours,
    uniqueBettors7Days,
    uniqueBettors30Days,
    ...cpmmFields,
  }
}

const computeProbChanges = async (
  contract: CPMMContract,
  yesterday: number,
  weekAgo: number,
  monthAgo: number
) => {
  let prob = getProbability(contract)
  const { resolution, resolutionProbability } = contract
  if (resolution === 'YES') prob = 1
  else if (resolution === 'NO') prob = 0
  else if (resolution === 'MKT' && resolutionProbability !== undefined)
    prob = resolutionProbability

  const [probYesterday, probWeekAgo, probMonthAgo] = await Promise.all(
    [yesterday, weekAgo, monthAgo].map((t) => getProbAt(contract, prob, t))
  )
  const probChanges = {
    day: prob - probYesterday,
    week: prob - probWeekAgo,
    month: prob - probMonthAgo,
  }
  return { prob, probChanges }
}

const getProbAt = async (
  contract: Contract,
  currentProb: number,
  since: number
) => {
  if (contract.resolutionTime && since >= contract.resolutionTime)
    return currentProb

  const [betBefore, betAfter] = await getBetsAroundTime(contract.id, since)
  if (betBefore) {
    return betBefore.probAfter
  } else if (betAfter) {
    return betAfter.probBefore
  } else {
    return currentProb // there are no bets at all
  }
}

async function getBetsAroundTime(contractId: string, when: number) {
  const bets = firestore
    .collection('contracts')
    .doc(contractId)
    .collection('bets') as CollectionReference<Bet>
  const beforeQ = bets
    .where('createdTime', '<', when)
    .orderBy('createdTime', 'desc')
    .limit(1)
  const afterQ = bets
    .where('createdTime', '>=', when)
    .orderBy('createdTime', 'asc')
    .limit(1)
  const results = await Promise.all([beforeQ.get(), afterQ.get()])
  return results.map((d) => d.docs[0]?.data() as Bet | undefined)
}

async function getUniqueBettors(contractId: string, since: number) {
  return (
    await firestore
      .collectionGroup('contract-metrics')
      .where('contractId', '==', contractId)
      .where('lastBetTime', '>', since)
      .count()
      .get()
  ).data().count
}
