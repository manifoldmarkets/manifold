import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getContractVoters } from 'web/lib/supabase/polls'

export function useContractVoters(contractId: string) {
  const [contractVoters, setContractVoters] = useState<User[] | undefined>(
    undefined
  )
  useEffect(() => {
    getContractVoters(contractId).then((voters) => {
      setContractVoters(voters)
    })
  }, [contractId])
  return contractVoters
}
