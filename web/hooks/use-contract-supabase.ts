import { AnyContractType, Contract } from 'common/contract'
import { useEffect, useState } from 'react'
import { getContractFromSlug } from 'web/lib/supabase/contracts'

export const useContractFromSlug = (contractSlug: string | undefined) => {
  const [contract, setContract] = useState<Contract | undefined>(undefined)

  useEffect(() => {
    if (contractSlug) {
      getContractFromSlug(contractSlug).then((result) => {
        setContract(result)
      })
    }
  }, [contractSlug])

  return contract as Contract<AnyContractType>
}
