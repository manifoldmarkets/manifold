import { Contract } from 'common/contract'
import { DEEMPHASIZED_GROUP_SLUGS } from 'common/envs/constants'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export async function getTrendingContracts<C extends Contract>({
  limit = 20,
}: { limit?: number } = {}) {
  const { data } = await db
    .from('trending_contracts')
    .select('data')
    .eq('mechanism', 'cpmm-1')
    .eq('outcome_type', 'BINARY')
    .limit(limit)

  const contracts = (data ?? [])
    ?.map(({ data }) => data as C)
    .filter((contract) => {
      return !contract.groupSlugs?.some((slug) =>
        DEEMPHASIZED_GROUP_SLUGS.includes(slug)
      )
    })

  return contracts
}

export function useGetTrendingContracts<C extends Contract>(
  options: { limit?: number } = {}
) {
  const [trendingContracts, setTrendingContracts] = useState<Array<C>>([])

  useEffect(() => {
    getTrendingContracts<C>(options).then(setTrendingContracts)
  }, [options.limit])

  return trendingContracts
}
