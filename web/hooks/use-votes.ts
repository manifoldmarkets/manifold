import { useEffect, useState } from 'react'
import { getContractVoters, getOptionVoters } from 'web/lib/supabase/polls'

export function useContractVoters(contractId: string) {
  const [contractVoters, setContractVoters] = useState<string[] | undefined>(
    undefined
  )

  useEffect(() => {
    getContractVoters(contractId).then((voters) => {
      setContractVoters(voters)
    })
  }, [contractId])
  return contractVoters
}

export function useOptionVoters(contractId: string, optionId: string) {
  const [optionVoters, setOptionVoters] = useState<string[] | undefined>(
    undefined
  )
  useEffect(() => {
    getOptionVoters(contractId, optionId).then((voters) => {
      setOptionVoters(voters)
    })
  }, [contractId, optionId])
  return optionVoters
}
