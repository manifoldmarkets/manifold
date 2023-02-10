import { z } from 'zod'
import { APIError, newEndpoint, validate } from './api'
import { log } from 'shared/utils'
import { Contract, CPMMBinaryContract } from 'common/contract'
import { User } from 'common/user'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { removeUndefinedProps } from 'common/util/object'
import { Acceptance, Challenge } from 'common/challenge'
import { CandidateBet } from 'common/new-bet'
import { createChallengeAcceptedNotification } from './create-notification'
import { noFees } from 'common/fees'
import { formatMoney, formatPercent } from 'common/util/format'
import { redeemShares } from './redeem-shares'

const bodySchema = z.object({
  contractId: z.string(),
  challengeSlug: z.string(),
  outcomeType: z.literal('BINARY'),
  closeTime: z.number().gte(Date.now()),
})
const firestore = admin.firestore()

export const acceptchallenge = newEndpoint({}, async (req, auth) => {
  const { challengeSlug, contractId } = validate(bodySchema, req.body)

  const result = await firestore.runTransaction(async (trans) => {
    const contractDoc = firestore.doc(`contracts/${contractId}`)
    const userDoc = firestore.doc(`users/${auth.uid}`)
    const challengeDoc = firestore.doc(
      `contracts/${contractId}/challenges/${challengeSlug}`
    )
    const [contractSnap, userSnap, challengeSnap] = await trans.getAll(
      contractDoc,
      userDoc,
      challengeDoc
    )
    if (!contractSnap.exists) throw new APIError(400, 'Contract not found.')
    if (!userSnap.exists) throw new APIError(400, 'User not found.')
    if (!challengeSnap.exists) throw new APIError(400, 'Challenge not found.')

    const anyContract = contractSnap.data() as Contract
    const user = userSnap.data() as User
    const challenge = challengeSnap.data() as Challenge

    if (challenge.acceptances.length > 0)
      throw new APIError(400, 'Challenge already accepted.')

    const creatorDoc = firestore.doc(`users/${challenge.creatorId}`)
    const creatorSnap = await trans.get(creatorDoc)
    if (!creatorSnap.exists) throw new APIError(400, 'Creator not found.')
    const creator = creatorSnap.data() as User

    const {
      creatorAmount,
      acceptorOutcome,
      creatorOutcome,
      creatorOutcomeProb,
      acceptorAmount,
    } = challenge

    if (user.balance < acceptorAmount)
      throw new APIError(400, 'Insufficient balance.')

    if (creator.balance < creatorAmount)
      throw new APIError(400, 'Creator has insufficient balance.')

    const contract = anyContract as CPMMBinaryContract
    const shares = (1 / creatorOutcomeProb) * creatorAmount
    const createdTime = Date.now()
    const probOfYes =
      creatorOutcome === 'YES' ? creatorOutcomeProb : 1 - creatorOutcomeProb

    log(
      'Creating challenge bet for',
      user.username,
      shares,
      acceptorOutcome,
      'shares',
      'at',
      formatPercent(creatorOutcomeProb),
      'for',
      formatMoney(acceptorAmount)
    )

    const yourNewBet: CandidateBet = removeUndefinedProps({
      orderAmount: acceptorAmount,
      amount: acceptorAmount,
      shares,
      isCancelled: false,
      contractId: contract.id,
      outcome: acceptorOutcome,
      probBefore: probOfYes,
      probAfter: probOfYes,
      loanAmount: 0,
      createdTime,
      fees: noFees,
      challengeSlug: challenge.slug,
      isAnte: false,
      isRedemption: false,
      isChallenge: true,
    })

    const yourNewBetDoc = contractDoc.collection('bets').doc()
    trans.create(yourNewBetDoc, {
      id: yourNewBetDoc.id,
      userId: user.id,
      ...yourNewBet,
    })

    trans.update(userDoc, { balance: FieldValue.increment(-yourNewBet.amount) })

    const creatorNewBet: CandidateBet = removeUndefinedProps({
      orderAmount: creatorAmount,
      amount: creatorAmount,
      shares,
      isCancelled: false,
      contractId: contract.id,
      outcome: creatorOutcome,
      probBefore: probOfYes,
      probAfter: probOfYes,
      loanAmount: 0,
      createdTime,
      fees: noFees,
      challengeSlug: challenge.slug,
      isAnte: false,
      isRedemption: false,
      isChallenge: true,
    })
    const creatorBetDoc = contractDoc.collection('bets').doc()
    trans.create(creatorBetDoc, {
      id: creatorBetDoc.id,
      userId: creator.id,
      ...creatorNewBet,
    })

    trans.update(creatorDoc, {
      balance: FieldValue.increment(-creatorNewBet.amount),
    })

    const volume = contract.volume + yourNewBet.amount + creatorNewBet.amount
    trans.update(contractDoc, { volume })

    trans.update(
      challengeDoc,
      removeUndefinedProps({
        acceptedByUserIds: [user.id],
        acceptances: [
          {
            userId: user.id,
            betId: yourNewBetDoc.id,
            createdTime,
            amount: acceptorAmount,
            userUsername: user.username,
            userName: user.name,
            userAvatarUrl: user.avatarUrl,
          } as Acceptance,
        ],
      })
    )

    await createChallengeAcceptedNotification(
      user,
      creator,
      challenge,
      acceptorAmount,
      contract
    )
    log('Done, sent notification.')
    return { bet: yourNewBetDoc, contract }
  })

  const { bet, contract } = result
  await redeemShares(auth.uid, contract)

  return { betId: bet.id }
})
