import { LiquidityProvision } from 'common/liquidity-provision'
import { useEffect, useState } from 'react'
import { getLiquidtyDocs } from 'web/lib/supabase/liquidity'
import { useApiSubscription } from './use-api-subscription'

export const useLiquidity = (contractId: string) => {
  const [liquidities, setLiquidities] = useState<
    LiquidityProvision[] | undefined
  >(undefined)

  useEffect(() => {
    getLiquidtyDocs(contractId).then(setLiquidities)
  }, [contractId])

  useApiSubscription({
    topics: [`contract/${contractId}/new-subsidy`],
    onBroadcast: () => {
      getLiquidtyDocs(contractId).then(setLiquidities)
    },
  })

  return liquidities
}
