import * as admin from 'firebase-admin'
import { APIError, type APIHandler } from './helpers/endpoint'
import { Contract } from 'common/contract'
import { Bet } from 'common/bet'
import { getSellBetInfo } from 'common/sell-bet'
import { addObjects, removeUndefinedProps } from 'common/util/object'
import { getUser } from 'shared/utils'
import { runEvilTransaction } from 'shared/evil-transaction'
import { incrementBalance } from 'shared/supabase/users'

export const sellShareDPM: APIHandler<'sell-shares-dpm'> = async (
  req,
  auth
) => {
  const { contractId, betId } = req

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  // run as transaction to prevent race conditions
  return await runEvilTransaction(async (pgTrans, fbTrans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`)
    const [contractSnap, betSnap] = await fbTrans.getAll(contractDoc, betDoc)
    if (!contractSnap.exists) throw new APIError(404, 'Contract not found')
    if (!betSnap.exists) throw new APIError(404, 'Bet not found')

    const contract = contractSnap.data() as Contract
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
    const increment = saleAmount + (newBet.loanAmount ?? 0)
    const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()

    await incrementBalance(pgTrans, user.id, { balance: increment })

    const now = Date.now()

    fbTrans.update(betDoc, { isSold: true })
    fbTrans.create(newBetDoc, {
      id: newBetDoc.id,
      userId: user.id,
      userAvatarUrl: user.avatarUrl,
      userUsername: user.username,
      userName: user.name,
      ...newBet,
    })
    fbTrans.update(contractDoc, {
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

const firestore = admin.firestore()
