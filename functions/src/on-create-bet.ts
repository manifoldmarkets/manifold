import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { keyBy } from 'lodash'

import { Bet, LimitBet } from '../../common/bet'
import { getContract, getUser, getValues } from './utils'
import { createBetFillNotification } from './create-notification'
import { filterDefined } from '../../common/util/array'

const firestore = admin.firestore()

export const onCreateBet = functions.firestore
  .document('contracts/{contractId}/bets/{betId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }
    const { eventId } = context

    const bet = change.data() as Bet
    const lastBetTime = bet.createdTime

    await firestore
      .collection('contracts')
      .doc(contractId)
      .update({ lastBetTime, lastUpdatedTime: Date.now() })

    await notifyFills(bet, contractId, eventId)
  })

const notifyFills = async (bet: Bet, contractId: string, eventId: string) => {
  if (!bet.fills) return

  const user = await getUser(bet.userId)
  if (!user) return
  const contract = await getContract(contractId)
  if (!contract) return

  const matchedFills = bet.fills.filter((fill) => fill.matchedBetId !== null)
  const matchedBets = (
    await Promise.all(
      matchedFills.map((fill) =>
        getValues<LimitBet>(
          firestore.collectionGroup('bets').where('id', '==', fill.matchedBetId)
        )
      )
    )
  ).flat()

  const betUsers = await Promise.all(
    matchedBets.map((bet) => getUser(bet.userId))
  )
  const betUsersById = keyBy(filterDefined(betUsers), 'id')

  await Promise.all(
    matchedBets.map((matchedBet) => {
      const matchedUser = betUsersById[matchedBet.userId]
      if (!matchedUser) return

      return createBetFillNotification(
        user,
        matchedUser,
        bet,
        matchedBet,
        contract,
        eventId
      )
    })
  )
}
