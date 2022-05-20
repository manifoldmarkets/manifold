import { listContracts } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'
import { User } from 'common/user'

let sessionCreatedContractToday = true

export function getUtcMidnightToday() {
  // Uses utc time like the server.
  const utcTimeString = new Date().toISOString()
  return new Date(utcTimeString).setUTCHours(0, 0, 0, 0)
}

export const useHasCreatedContractToday = (user: User | null | undefined) => {
  const [hasCreatedContractToday, setHasCreatedContractToday] = useState<
    boolean | 'loading'
  >('loading')

  useEffect(() => {
    setHasCreatedContractToday('loading')
    const todayAtMidnight = getUtcMidnightToday()
    async function listUserContractsForToday() {
      if (!user) return

      const contracts = await listContracts(user.id)
      const todayContracts = contracts.filter(
        (contract) => contract.createdTime > todayAtMidnight
      )

      sessionCreatedContractToday = todayContracts.length > 0
      setHasCreatedContractToday(sessionCreatedContractToday)
    }

    listUserContractsForToday()
  }, [user])

  return hasCreatedContractToday
}
