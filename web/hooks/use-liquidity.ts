import { LiquidityProvision } from 'common/liquidity-provision'
import { useEffect, useRef, useState } from 'react'
import { getLiquidityDocs } from 'web/lib/supabase/liquidity'
import { useApiSubscription } from 'client-common/hooks/use-api-subscription'
import { useIsPageVisible } from './use-page-visible'

export const useLiquidity = (contractId: string) => {
  const generation = useRef(0)
  const [liquidities, setLiquidities] = useState<
    LiquidityProvision[] | undefined
  >(undefined)

  const isPageVisible = useIsPageVisible()
  const readLiquidity = async () => {
    const request = ++generation.current
    const result = await getLiquidityDocs(contractId)
    if (!result) throw new Error('Could not refresh liquidity.')
    return () => {
      if (request !== generation.current) return false
      setLiquidities(result)
    }
  }

  useEffect(() => {
    if (isPageVisible) {
      readLiquidity()
        .then((commit) => commit())
        .catch(console.error)
    }
    return () => {
      generation.current++
    }
  }, [contractId, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-subsidy`],
    getSnapshot: readLiquidity,
    onBroadcast: () => {
      readLiquidity()
        .then((commit) => commit())
        .catch(console.error)
    },
  })

  return liquidities
}
