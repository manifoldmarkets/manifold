import * as functions from 'firebase-functions'
import { getUser, getValues, log } from './utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { Txn } from '../../common/txn'
import { partition, sortBy } from 'lodash'
import { runTxn, TxnData } from './transact'
import * as admin from 'firebase-admin'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { openCommentBounties, closeTime, question } = contract

    if (
      !previousContract.isResolved &&
      contract.isResolved &&
      (openCommentBounties ?? 0) > 0
    ) {
      await handleUnusedCommentBountyRefunds(contract)
      // No need to notify users of resolution, that's handled in resolve-market
      return
    }
    if (
      previousContract.closeTime !== closeTime ||
      previousContract.question !== question
    ) {
      await handleUpdatedCloseTime(previousContract, contract, eventId)
    }
  })

async function handleUpdatedCloseTime(
  previousContract: Contract,
  contract: Contract,
  eventId: string
) {
  const contractUpdater = await getUser(contract.creatorId)
  if (!contractUpdater) throw new Error('Could not find contract updater')
  let sourceText = ''
  if (previousContract.closeTime !== contract.closeTime && contract.closeTime) {
    sourceText = contract.closeTime.toString()
  } else if (previousContract.question !== contract.question) {
    sourceText = contract.question
  }

  await createCommentOrAnswerOrUpdatedContractNotification(
    contract.id,
    'contract',
    'updated',
    contractUpdater,
    eventId,
    sourceText,
    contract
  )
}

async function handleUnusedCommentBountyRefunds(contract: Contract) {
  const outstandingCommentBounties = await getValues<Txn>(
    firestore.collection('txns').where('category', '==', 'COMMENT_BOUNTY')
  )

  const commentBountiesOnThisContract = sortBy(
    outstandingCommentBounties.filter(
      (bounty) => bounty.data?.contractId === contract.id
    ),
    (bounty) => bounty.createdTime
  )

  const [toBank, fromBank] = partition(
    commentBountiesOnThisContract,
    (bounty) => bounty.toType === 'BANK'
  )
  if (toBank.length <= fromBank.length) return

  await firestore
    .collection('contracts')
    .doc(contract.id)
    .update({ openCommentBounties: 0 })

  const refunds = toBank.slice(fromBank.length)
  await Promise.all(
    refunds.map(async (extraBountyTxn) => {
      const result = await firestore.runTransaction(async (trans) => {
        const bonusTxn: TxnData = {
          fromId: extraBountyTxn.toId,
          fromType: 'BANK',
          toId: extraBountyTxn.fromId,
          toType: 'USER',
          amount: extraBountyTxn.amount,
          token: 'M$',
          category: 'REFUND_COMMENT_BOUNTY',
          data: {
            contractId: contract.id,
          },
        }
        return await runTxn(trans, bonusTxn)
      })

      if (result.status != 'success' || !result.txn) {
        log(
          `Couldn't refund bonus for user: ${extraBountyTxn.fromId} - status:`,
          result.status
        )
        log('message:', result.message)
      } else {
        log(
          `Refund bonus txn for user: ${extraBountyTxn.fromId} completed:`,
          result.txn?.id
        )
      }
    })
  )
}

const firestore = admin.firestore()
