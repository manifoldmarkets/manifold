import * as functions from 'firebase-functions'

import { PollOption } from 'common/poll-option'
import { secrets } from 'common/secrets'
import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const pollPollResolutions = functions
  .runWith({
    timeoutSeconds: 180,
    secrets,
  })
  // .pubsub.schedule('*/1 * * * *') // runs every minute
  .pubsub.schedule('every 5 minutes') // runs every minute
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    const closedPolls = await pg.manyOrNone(
      `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
    )

    await Promise.all(
      closedPolls.map((poll) => {
        const maxVoteIds = getMaxVoteId(poll.data.options)
        return firestore.collection('contracts').doc(poll.data.id).update({
          resolutionTime: new Date(),
          resolutions: maxVoteIds,
          isResolved: true,
        })
      })
    )
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

const firestore = admin.firestore()
