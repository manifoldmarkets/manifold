import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log, getContractSupabase, getUser } from 'shared/utils'
import { isAdminId, isModId } from 'common/envs/constants'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { Notification } from 'common/notification'
import { randomString } from 'common/util/random'
import { betsQueue } from 'shared/helpers/fn-queue'

export const approvePendingAnswer: APIHandler<
  'pending-answer/:id/approve'
> = async (props, auth) => {
  const { id } = props

  const pg = createSupabaseDirectClient()

  // Get pending answer
  const pendingAnswer = await pg.oneOrNone(
    `select * from pending_answers where id = $1`,
    [id]
  )

  if (!pendingAnswer) {
    throw new APIError(404, 'Pending answer not found')
  }

  if (pendingAnswer.status !== 'pending') {
    throw new APIError(400, 'This answer has already been reviewed')
  }

  // Get contract
  const contract = await getContractSupabase(pendingAnswer.contract_id)

  if (!contract) {
    throw new APIError(404, 'Contract not found')
  }

  // Only creator, admins, and mods can approve
  if (
    auth.uid !== contract.creatorId &&
    !isAdminId(auth.uid) &&
    !isModId(auth.uid)
  ) {
    throw new APIError(403, 'Only the market creator can approve answers')
  }

  // Verify it's a multi-choice contract
  if (contract.mechanism !== 'cpmm-multi-1') {
    throw new APIError(400, 'Contract must be a multiple choice market')
  }

  // Check if contract is still open
  if (contract.isResolved || (contract.closeTime && contract.closeTime < Date.now())) {
    throw new APIError(403, 'Market is closed or resolved')
  }

  // Check for duplicate in existing answers (in case it was added while pending)
  const existingAnswer = await pg.oneOrNone(
    `select id from answers where contract_id = $1 and text = $2`,
    [contract.id, pendingAnswer.text]
  )

  if (existingAnswer) {
    // Mark as approved but note it already exists
    await pg.none(
      `update pending_answers
       set status = 'approved', reviewed_by = $1, reviewed_time = now()
       where id = $2`,
      [auth.uid, id]
    )
    throw new APIError(400, 'An answer with this text already exists')
  }

  // Create the answer using betsQueue for proper sequencing
  let answerId: string
  try {
    const result = await betsQueue.enqueueFn(
      async () => {
        // Manually create the answer since we can't call the handler directly
        const answerId = randomString()
        const { insertAnswer } = await import('shared/supabase/answers')
        const { getAnswerCostFromLiquidity } = await import('common/tier')
        const { incrementBalance } = await import('shared/supabase/users')
        const { getAnswersForContract } = await import('shared/supabase/answers')
        const { removeUndefinedProps } = await import('common/util/object')

        // Get current answers to determine count
        const currentAnswers = await getAnswersForContract(pg, contract.id)

        const answerCost = getAnswerCostFromLiquidity(
          contract.totalLiquidity,
          currentAnswers.length
        )

        // Get fresh user balance
        const submitter = await getUser(pendingAnswer.user_id, pg)
        if (!submitter) throw new APIError(404, 'Submitter not found')
        if (submitter.balance < answerCost) {
          throw new APIError(403, 'Submitter has insufficient balance')
        }

        // Charge the submitter
        await incrementBalance(pg, pendingAnswer.user_id, {
          balance: -answerCost,
          totalDeposits: -answerCost,
        })

        // Create the new answer with all required fields
        const newAnswer: any = {
          id: answerId, // Optional but we set it explicitly
          contractId: contract.id,
          userId: pendingAnswer.user_id,
          text: pendingAnswer.text,
          createdTime: Date.now(),
          index: currentAnswers.length,
          poolYes: answerCost,
          poolNo: answerCost,
          prob: 0.5,
          totalLiquidity: answerCost,
          subsidyPool: 0,
          isOther: false,
        }

        await insertAnswer(pg, newAnswer)

        return { newAnswerId: answerId }
      },
      [contract.id, pendingAnswer.user_id]
    )
    answerId = result.newAnswerId

    // Mark pending answer as approved
    await pg.none(
      `update pending_answers
       set status = 'approved', reviewed_by = $1, reviewed_time = now()
       where id = $2`,
      [auth.uid, id]
    )

    // Create notification for submitter
    const reviewer = await getUser(auth.uid)
    if (reviewer) {
      const notification: Notification = {
        id: randomString(),
        userId: pendingAnswer.user_id,
        reasonText: 'Your answer was approved',
        reason: 'answer_on_your_contract', // Reusing existing notification type
        createdTime: Date.now(),
        isSeen: false,
        sourceId: answerId,
        sourceType: 'answer',
        sourceContractId: contract.id,
        sourceUserName: reviewer.name,
        sourceUserUsername: reviewer.username,
        sourceUserAvatarUrl: reviewer.avatarUrl,
        sourceText: pendingAnswer.text,
        sourceContractCreatorUsername: contract.creatorUsername,
        sourceContractTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceSlug: contract.slug,
      }
      await insertNotificationToSupabase(notification, pg)
    }

    log('Approved pending answer', {
      pendingAnswerId: id,
      newAnswerId: answerId,
      contractId: contract.id,
      submitterId: pendingAnswer.user_id,
      reviewerId: auth.uid,
    })

    return { newAnswerId: answerId }
  } catch (error) {
    log.error('Error approving pending answer', {
      error,
      pendingAnswerId: id,
      contractId: contract.id,
    })
    throw new APIError(500, 'Failed to create answer: ' + error)
  }
}
