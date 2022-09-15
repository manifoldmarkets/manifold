import { mapValues, groupBy, sumBy, uniq } from 'lodash'
import * as admin from 'firebase-admin'
import { z } from 'zod'

import { APIError, newEndpoint, validate } from './api'
import { Contract, CPMM_MIN_POOL_QTY } from '../../common/contract'
import { User } from '../../common/user'
import { getCpmmSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { log } from './utils'
import { Bet } from '../../common/bet'
import { floatingEqual, floatingLesserEqual } from '../../common/util/math'
import { getUnfilledBetsQuery, updateMakers } from './place-bet'
import { FieldValue } from 'firebase-admin/firestore'
import { redeemShares } from './redeem-shares'
import { removeUserFromContractFollowers } from './follow-market'

const bodySchema = z.object({
  contractId: z.string(),
  shares: z.number().optional(), // leave it out to sell all shares
  outcome: z.enum(['YES', 'NO']).optional(), // leave it out to sell whichever you have
})

export const sellshares = newEndpoint({}, async (req, auth) => {
  const { contractId, shares, outcome } = validate(bodySchema, req.body)

  // Run as transaction to prevent race conditions.
  const result = await firestore.runTransaction(async (transaction) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const betsQ = contractDoc.collection('bets').where('userId', '==', auth.uid)
    const [[contractSnap, userSnap], userBetsSnap, unfilledBetsSnap] =
      await Promise.all([
        transaction.getAll(contractDoc, userDoc),
        transaction.get(betsQ),
        transaction.get(getUnfilledBetsQuery(contractDoc)),
      ])
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    const userBets = userBetsSnap.docs.map((doc) => doc.data() as Bet)
    const unfilledBets = unfilledBetsSnap.docs.map((doc) => doc.data())

    const contract = contractSnap.data() as Contract
    const user = userSnap.data() as User

    const { closeTime, mechanism, collectedFees, volume } = contract

    if (mechanism !== 'cpmm-1')
      throw new APIError(400, 'You can only sell shares on CPMM-1 contracts.')
    if (closeTime && Date.now() > closeTime)
      throw new APIError(400, 'Trading is closed.')

    const loanAmount = sumBy(userBets, (bet) => bet.loanAmount ?? 0)
    const betsByOutcome = groupBy(userBets, (bet) => bet.outcome)
    const sharesByOutcome = mapValues(betsByOutcome, (bets) =>
      sumBy(bets, (b) => b.shares)
    )

    let chosenOutcome: 'YES' | 'NO'
    if (outcome != null) {
      chosenOutcome = outcome
    } else {
      const nonzeroShares = Object.entries(sharesByOutcome).filter(
        ([_k, v]) => !floatingEqual(0, v)
      )
      if (nonzeroShares.length == 0) {
        throw new APIError(400, "You don't own any shares in this market.")
      }
      if (nonzeroShares.length > 1) {
        throw new APIError(
          400,
          `You own multiple kinds of shares, but did not specify which to sell.`
        )
      }
      chosenOutcome = nonzeroShares[0][0] as 'YES' | 'NO'
    }

    const maxShares = sharesByOutcome[chosenOutcome]
    const sharesToSell = shares ?? maxShares

    if (!floatingLesserEqual(sharesToSell, maxShares))
      throw new APIError(400, `You can only sell up to ${maxShares} shares.`)

    const soldShares = Math.min(sharesToSell, maxShares)
    const saleFrac = soldShares / maxShares
    let loanPaid = saleFrac * loanAmount
    if (!isFinite(loanPaid)) loanPaid = 0

    const { newBet, newPool, newP, fees, makers } = getCpmmSellBetInfo(
      soldShares,
      chosenOutcome,
      contract,
      unfilledBets,
      loanPaid
    )

    if (
      !newP ||
      !isFinite(newP) ||
      Math.min(...Object.values(newPool ?? {})) < CPMM_MIN_POOL_QTY
    ) {
      throw new APIError(400, 'Sale too large for current liquidity pool.')
    }

    const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()

    updateMakers(makers, newBetDoc.id, contractDoc, transaction)

    transaction.update(userDoc, {
      balance: FieldValue.increment(-newBet.amount + (newBet.loanAmount ?? 0)),
    })
    transaction.create(newBetDoc, {
      id: newBetDoc.id,
      userId: user.id,
      userAvatarUrl: user.avatarUrl,
      userUsername: user.username,
      userName: user.name,
      ...newBet,
    })
    transaction.update(
      contractDoc,
      removeUndefinedProps({
        pool: newPool,
        p: newP,
        collectedFees: addObjects(fees, collectedFees),
        volume: volume + Math.abs(newBet.amount),
      })
    )

    return { newBet, makers, maxShares, soldShares }
  })

  if (result.maxShares === result.soldShares) {
    await removeUserFromContractFollowers(contractId, auth.uid)
  }
  const userIds = uniq(result.makers.map((maker) => maker.bet.userId))
  await Promise.all(userIds.map((userId) => redeemShares(userId, contractId)))
  log('Share redemption transaction finished.')

  return { status: 'success' }
})

const firestore = admin.firestore()
