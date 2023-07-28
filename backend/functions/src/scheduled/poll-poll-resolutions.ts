import * as functions from 'firebase-functions'

import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { processNews } from 'shared/process-news'
import { secrets } from 'common/secrets'
import * as admin from 'firebase-admin'
import { PollOption } from 'common/poll-option'

export const pollPollResolutions = functions
  .runWith({
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule('*/1 * * * *') // runs every minute
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    const firestore = admin.firestore()
    const bulkWriter = firestore.bulkWriter()
    const closedPolls = await pg.manyOrNone(
      `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
    )

    for (const poll of closedPolls) {
      const maxVoteIds = getMaxVoteId(poll.data.options)
      const ref = firestore.collection('contracts').doc(poll.id)
      bulkWriter.update(ref, {
        resolutionTime: new Date(),
        resolutions: maxVoteIds,
        isResolved: true,
      })
    }
  })

function getMaxVoteId(arr: PollOption[]): string[] {
  // Reduce the array to a structure that keeps track of maxVotes and maxVoteIds
  const result = arr.reduce<{ maxVotes: number; maxVoteIds: string[] }>(
    (acc, item) => {
      if (item.votes > acc.maxVotes) {
        return { maxVotes: item.votes, maxVoteIds: [item.id] }
      } else if (item.votes === acc.maxVotes) {
        acc.maxVoteIds.push(item.id)
      }
      return acc
    },
    { maxVotes: -Infinity, maxVoteIds: [] }
  )

  return result.maxVoteIds
}
