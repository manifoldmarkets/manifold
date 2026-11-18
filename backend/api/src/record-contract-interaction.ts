import { APIHandler } from 'api/helpers/endpoint'
import { completeSharingQuest } from 'shared/complete-quest-internal'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'

export const recordContractInteraction: APIHandler<
  'record-contract-interaction'
> = async (body, auth) => {
  const {
    contractId,
    kind,
    feedType,
    commentId,
    betGroupId,
    betId,
    feedReasons,
  } = body
  log('recordContractInteraction', body)
  const pg = createSupabaseDirectClient()
  await pg.none(
    `
    insert into user_contract_interactions
        (
          user_id,
          contract_id,
          name,
          feed_type,
          feed_reasons,
          comment_id,
          bet_group_id,
          bet_id
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      auth.uid,
      contractId,
      kind,
      feedType,
      feedReasons,
      commentId,
      betGroupId,
      betId,
    ]
  )
  if (kind === 'page share') {
    // Pay the daily sharing quest from the request that records the share, so
    // the reward doesn't depend on the client's follow-up /completequest call
    // arriving (on phones it is often cut off when the user switches apps to
    // paste the link). Both paths pay at most once a day. The share is already
    // recorded, so a failed payout mustn't fail this request.
    try {
      const user = await getUser(auth.uid)
      if (user) await completeSharingQuest(user)
    } catch (e) {
      log.error('Failed to complete sharing quest', {
        userId: auth.uid,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return { status: 'success' }
}
