import * as admin from 'firebase-admin'
import { APIError, typedEndpoint } from './helpers'
import { Contract } from 'common/contract'
import { User } from 'common/user'
import { Bet } from 'common/bet'
import { getSellBetInfo } from 'common/sell-bet'
import { addObjects, removeUndefinedProps } from 'common/util/object'

export const sellShareDPM = typedEndpoint(
  'sell-shares-dpm',
  async (req, auth) => {
    const { contractId, betId } = req
    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const userDoc = firestore.doc(`users/${auth.uid}`)
      const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`)
      const [contractSnap, userSnap, betSnap] = await transaction.getAll(
        contractDoc,
        userDoc,
        betDoc
      )
      if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
      if (!userSnap.exists)
        throw new APIError(401, 'Your account was not found')
      if (!betSnap.exists) throw new APIError(404, 'Bet not found')

      const contract = contractSnap.data() as Contract
      const user = userSnap.data() as User
      const bet = betSnap.data() as Bet

      const { closeTime, mechanism, collectedFees, volume } = contract
      if (mechanism !== 'dpm-2')
        throw new APIError(403, 'You can only sell bets on DPM-2 contracts')
      if (closeTime && Date.now() > closeTime)
        throw new APIError(403, 'Trading is closed')

      if (auth.uid !== bet.userId)
        throw new APIError(403, 'You did not make this bet')
      if (bet.isSold) throw new APIError(403, 'Bet is already sold')

      const { newBet, newPool, newTotalShares, newTotalBets, fees } =
        getSellBetInfo(bet, contract)

      /* eslint-disable-next-line @typescript-eslint/no-non-null-assertion */
      const saleAmount = newBet.sale!.amount
      const newBalance = user.balance + saleAmount + (newBet.loanAmount ?? 0)
      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const now = Date.now()
      transaction.update(userDoc, { balance: newBalance })
      transaction.update(betDoc, { isSold: true })
      transaction.create(newBetDoc, {
        id: newBetDoc.id,
        userId: user.id,
        userAvatarUrl: user.avatarUrl,
        userUsername: user.username,
        userName: user.name,
        ...newBet,
      })
      transaction.update(contractDoc, {
        lastBetTime: now,
        lastUpdatedTime: now,
        ...removeUndefinedProps({
          pool: newPool,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
          collectedFees: addObjects(fees, collectedFees),
          volume: volume + Math.abs(newBet.amount),
        }),
      })
    })
  }
)

const firestore = admin.firestore()
