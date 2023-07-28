import * as functions from 'firebase-functions'

import { PollOption } from 'common/poll-option'
import { secrets } from 'common/secrets'
import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { createPollClosedNotification } from 'shared/create-notification'

export const pollPollResolutions = functions
  .runWith({
    timeoutSeconds: 60,
    secrets,
  })
  .pubsub.schedule('*/1 * * * *') // runs every minute
  .onRun(async () => {
    await pollPollResolutionsFn()
  })

export async function pollPollResolutionsFn() {
  const pg = createSupabaseDirectClient()
  const closedPolls = await pg.manyOrNone(
    `select data from contracts where outcome_type = 'POLL' and close_time < now() and resolution_time is null`
  )

  console.log('closedPolls', closedPolls)
  await Promise.all(
    closedPolls.map((poll) => {
      const maxVoteIds = getMaxVoteId(poll.data.options)
      console.log('maxVoteIds', maxVoteIds)

      const update = {
        resolutionTime: Date.now(),
        resolutions: maxVoteIds,
        isResolved: true,
      }

      let winner: PollOption | undefined = undefined
      if (maxVoteIds.length === 1) {
        winner = poll.data.options.find(
          (option: PollOption) => option.id === maxVoteIds[0]
        )
      }
      console.log('data', poll.data)
      createPollClosedNotification(
        winner
          ? `'${winner.text}' won with ${winner.votes} votes`
          : `It's a tie!`,
        poll.data
      )
      return firestore.collection('contracts').doc(poll.data.id).update(update)
    })
  )
}

export function getMaxVoteId(arr: PollOption[]): string[] {
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
