import { User } from 'common/user'
import dayjs from 'dayjs'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useCallback, useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const useHasReceivedLoanToday = (user: User) => {
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  // user has either received a loan today or nextLoanCached is 0
  const [lastLoanReceived, setLastLoanReceived] = usePersistentLocalState<
    number | undefined
  >(undefined, `last-loan-${user.id}`)

  const checkTxns = useCallback(async () => {
    run(
      db
        .from('txns')
        .select('data->>createdTime')
        .eq('data->>toId', user.id)
        .eq('data->>category', 'LOAN')
        .gte('data->createdTime', startOfDay)
        .limit(1)
    )
      .then((res) => {
        if (res.data.length > 0) {
          setLastLoanReceived(parseInt(res.data[0].createdTime))
        } else {
          setLastLoanReceived(0)
        }
      })
      .catch((e) => {
        console.error('loan txns err', e)
      })
  }, [user.id])

  useEffect(() => {
    checkTxns()
  }, [user.id])
  return {
    receivedLoanToday:
      lastLoanReceived !== undefined && lastLoanReceived > startOfDay,
    checkTxns,
  }
}
