import { getHasBetOnContract } from 'web/lib/supabase/contracts'
import { useGetter } from './use-getter'
import { useUser } from './use-user'

export const useHasBetOnContract = (contractId: string) => {
  const user = useUser()
  const { data } = useGetter(
    'bet-on-contracts',
    { userId: user?.id, contractId },
    getHasBetOnContract
  )
  return data
}
