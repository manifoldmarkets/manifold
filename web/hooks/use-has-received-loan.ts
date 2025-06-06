import { User } from 'common/user'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(timezone)
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useCallback, useEffect } from 'react'
import { api } from 'web/lib/api/api'

export const useHasReceivedLoanToday = (user: User) => {
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  // user has either received a loan today or nextLoan is 0
  const [lastLoanReceived, setLastLoanReceived] = usePersistentLocalState<
    number | undefined
  >(undefined, `last-loan-${user.id}`)

  const checkTxns = useCallback(async () => {
    api('txns', {
      category: 'LOAN',
      toId: user.id,
      after: startOfDay,
      limit: 1,
    })
      .then((data) => {
        if (data.length > 0) {
          setLastLoanReceived(data[0].createdTime ?? 0)
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
