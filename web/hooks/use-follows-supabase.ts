import { RealtimeChannel } from '@supabase/realtime-js'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getContractFollows } from 'web/lib/supabase/follows'
import { useRealtimeChanges } from 'web/lib/supabase/realtime/use-realtime'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { Delete, Insert } from 'common/supabase/realtime'
import { uniq } from 'lodash'

export function useRealtimeContractFollows(contractId: string | undefined) {
  const [follows, setFollows] = useState<string[] | undefined | null>(undefined)

  const deletedFollows: Delete<'contract_follows'>[] = useRealtimeChanges(
    'DELETE',
    'contract_follows',
    {
      k: 'contract_id',
      v: contractId ?? '',
    }
  )
  const insertedFollows: Insert<'contract_follows'>[] = useRealtimeChanges(
    'INSERT',
    'contract_follows',
    {
      k: 'contract_id',
      v: contractId ?? '',
    }
  )

  useEffectCheckEquality(() => {
    if (!contractId) {
      return
    }
    getContractFollows(contractId)
      .then((result) => setFollows(result))
      .catch((e) => console.log(e))
  }, [contractId])

  let combinedFollows = [
    ...(follows ?? []),
    ...insertedFollows.map((followData) => followData.new.follow_id),
  ]

  // Get array of follow_ids from deletedFollows
  let deletedFollowIds = deletedFollows.map(
    (deletedFollow) => deletedFollow.old.follow_id
  )

  // For each element in deletedFollows, find its index in combinedFollows.
  // If it exists (the index is not -1), remove it from combinedFollows.
  deletedFollowIds.forEach((deletedFollowId) => {
    let index = combinedFollows.indexOf(deletedFollowId ?? '')
    if (index !== -1) {
      combinedFollows.splice(index, 1)
    }
  })

  return uniq(combinedFollows)
}
