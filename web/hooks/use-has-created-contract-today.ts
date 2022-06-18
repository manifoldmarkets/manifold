import { listContracts } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'
import { User } from 'common/user'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

export function getUtcFreeMarketResetTime(options: { previousTime: boolean }) {
  const { previousTime } = options
  const localTimeNow = new Date()
  const utc4pmToday = dayjs()
    .utc()
    .set('hour', 16)
    .set('minute', 0)
    .set('second', 0)
    .set('millisecond', 0)

  // if it's after 4pm UTC today
  if (localTimeNow.getTime() > utc4pmToday.valueOf()) {
    return previousTime
      ? // Return it as it is
        utc4pmToday.valueOf()
      : // Or add 24 hours to get the next 4pm UTC time:
        utc4pmToday.valueOf() + 24 * 60 * 60 * 1000
  }

  // 4pm UTC today is coming up
  return previousTime
    ? // Subtract 24 hours to get the previous 4pm UTC time:
      utc4pmToday.valueOf() - 24 * 60 * 60 * 1000
    : // Return it as it is
      utc4pmToday.valueOf()
}

export const useHasCreatedContractToday = (user: User | null | undefined) => {
  const [hasCreatedContractToday, setHasCreatedContractToday] = useState<
    boolean | 'loading'
  >('loading')

  useEffect(() => {
    const nextUtcResetTime = getUtcFreeMarketResetTime({ previousTime: false })
    setHasCreatedContractToday('loading')
    async function listUserContractsForToday() {
      const previousResetTime = getUtcFreeMarketResetTime({
        previousTime: true,
      })
      if (!user) return

      const contracts = await listContracts(user.id)
      const todayContracts = contracts.filter(
        (contract) => contract.createdTime > previousResetTime
      )

      setHasCreatedContractToday(todayContracts.length > 0)
    }

    const timeoutUntilNextFreeMarket = setTimeout(() => {
      setHasCreatedContractToday(false)
    }, nextUtcResetTime - Date.now())

    listUserContractsForToday()
    return () => clearTimeout(timeoutUntilNextFreeMarket)
  }, [user])

  return hasCreatedContractToday
}
