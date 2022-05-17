import { listContracts } from 'web/lib/firebase/contracts'
import { useEffect, useState } from 'react'
import { User } from 'common/user'

let sessionCreatedContractToday = false

export const useHasCreatedContractToday = (user: User | null | undefined) => {
  const [hasCreatedContractToday, setHasCreatedContractToday] = useState(
    sessionCreatedContractToday
  )

  useEffect(() => {
    // Uses utc time like the server.
    const utcTimeString = new Date().toISOString()
    const todayAtMidnight = new Date(utcTimeString).setUTCHours(0, 0, 0, 0)

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
