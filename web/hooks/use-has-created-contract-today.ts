import { listContracts } from '../lib/firebase/contracts'
import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { User } from '../../common/user'

export const useHasCreatedContractToday = (user: User | null | undefined) => {
  const [hasCreatedContractToday, setHasCreatedContractToday] = useState(false)

  useEffect(() => {
    // Uses utc time like the server.
    const todayAtMidnight = dayjs.utc().startOf('day').valueOf()

    async function listUserContractsForToday() {
      if (!user) return

      const contracts = await listContracts(user.id)
      const todayContracts = contracts.filter(
        (contract) => contract.createdTime > todayAtMidnight
      )
      setHasCreatedContractToday(todayContracts.length > 0)
    }

    listUserContractsForToday()
  }, [user])

  return hasCreatedContractToday
}
