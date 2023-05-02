import { RealtimeChannel } from '@supabase/realtime-js'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'
import { getContractFollows } from 'web/lib/supabase/follows'

export function useRealtimeContractFollows(contractId: string | undefined) {
  const [follows, setFollows] = useState<string[] | undefined | null>(undefined)

  useEffect(() => {
    if (contractId) {
      getContractFollows(contractId)
        .then((result) => setFollows(result))
        .catch((e) => console.log(e))
    }
  }, [])

  useEffect(() => {
    let channel: RealtimeChannel
    if (contractId && follows) {
      channel = db.channel(`realtime-contract-follows-${contractId}`)
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contract_follows',
          filter: 'contract_id=eq.' + contractId,
        },
        (payload) => {
          if (payload) {
            setFollows(payload.new as string[])
          }
        }
      )
      channel.subscribe(async (status) => {})
    }
    return () => {
      if (channel) {
        db.removeChannel(channel)
      }
    }
  }, [db])

  return follows
}
