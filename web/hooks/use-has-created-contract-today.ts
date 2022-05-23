import { listContracts } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'
import { User } from 'common/user'

let sessionCreatedContractToday = true

export function getUtcFreeMarketResetTime(yesterday: boolean) {
  // Uses utc time like the server.
  const utcFreeMarketResetTime = new Date()
  utcFreeMarketResetTime.setUTCDate(
    utcFreeMarketResetTime.getUTCDate() - (yesterday ? 1 : 0)
  )
  const utcFreeMarketMS = utcFreeMarketResetTime.setUTCHours(16, 0, 0, 0)
  return utcFreeMarketMS
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
