import { RealtimeChannel } from '@supabase/realtime-js'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getContractFollows } from 'web/lib/supabase/follows'

export function useRealtimeContractFollows(contractId: string | undefined) {
  const [follows, setFollows] = useState<string[] | undefined | null>(undefined)

  useEffect(() => {
    let channel: RealtimeChannel
    if (contractId) {
      getContractFollows(contractId)
        .then((result) => setFollows(result))
        .catch((e) => console.log(e))
      channel = db.channel(`realtime-contract-follows-${contractId}`)
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contract_follows',
          filter: `contract_id=eq.${contractId}`,
        },
        (payload) => {
          setFollows((follows) => {
            if (follows) {
              return [...follows, payload.new.follow_id]
            } else {
              return [payload.new.follow_id]
            }
          })
        }
      )
      channel.on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'contract_follows',
          filter: `contract_id=eq.${contractId}`,
        },
        (payload) => {
          setFollows((follows) => {
            if (follows) {
              return follows.filter(
                (follow) => follow !== payload.old.follow_id
              )
            } else {
              return
            }
          })
        }
      )
      channel.subscribe(async (status) => {})
    }
    return () => {
      if (channel) {
        db.removeChannel(channel)
      }
    }
  }, [db, contractId])
  return follows
}
