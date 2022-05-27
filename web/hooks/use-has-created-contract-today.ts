import { listContracts } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'
import { User } from 'common/user'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
dayjs.extend(utc)

let sessionCreatedContractToday = true

export function getUtcFreeMarketResetTime(previous: boolean) {
  const localTimeNow = new Date()
  const utc4pmToday = dayjs()
    .utc()
    .set('hour', 16)
    .set('minute', 0)
    .set('second', 0)
    .set('millisecond', 0)

  // if it's after 4pm UTC today
  if (localTimeNow.getTime() > utc4pmToday.valueOf()) {
    return previous
      ? // Return it as it is
        utc4pmToday.valueOf()
      : // Or add 24 hours to get the next 4pm UTC time:
        utc4pmToday.valueOf() + 24 * 60 * 60 * 1000
  }

  // 4pm UTC today is coming up
  return previous
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
    setHasCreatedContractToday('loading')
    const previousResetTime = getUtcFreeMarketResetTime(true)
    async function listUserContractsForToday() {
      if (!user) return

      const contracts = await listContracts(user.id)
      const todayContracts = contracts.filter(
        (contract) => contract.createdTime > previousResetTime
      )

      sessionCreatedContractToday = todayContracts.length > 0
      setHasCreatedContractToday(sessionCreatedContractToday)
    }

    listUserContractsForToday()
  }, [user])

  return hasCreatedContractToday
}
