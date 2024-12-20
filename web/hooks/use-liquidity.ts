import { LiquidityProvision } from 'common/liquidity-provision'
import { useEffect, useState } from 'react'
import { getLiquidityDocs } from 'web/lib/supabase/liquidity'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useIsPageVisible } from './use-page-visible'

export const useLiquidity = (contractId: string) => {
  const [liquidities, setLiquidities] = useState<
    LiquidityProvision[] | undefined
  >(undefined)

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible) {
      getLiquidityDocs(contractId).then(setLiquidities)
    }
  }, [contractId, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-subsidy`],
    onBroadcast: () => {
      getLiquidityDocs(contractId).then((liqs) => {
        if (liqs) setLiquidities(liqs)
      })
    },
  })

  return liquidities
}
