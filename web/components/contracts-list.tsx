import { useEffect, useState } from 'react'
import { useUser } from '../hooks/use-user'
import { Contract, listContracts } from '../lib/firebase/contracts'
import { ContractsGrid } from '../pages/markets'

export function ContractsList(props: {}) {
  const creator = useUser()

  const [contracts, setContracts] = useState<Contract[]>([])

  useEffect(() => {
    if (creator?.id) {
      // TODO: stream changes from firestore
      listContracts(creator.id).then(setContracts)
    }
  }, [creator])

  return <ContractsGrid contracts={contracts} />
}
