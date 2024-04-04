import { useEffect, useState } from 'react'
import { LiquidityProvision } from 'common/liquidity-provision'
import { listenForLiquidity } from 'web/lib/firebase/liquidity'

export const useLiquidity = (contractId: string) => {
  const [liquidities, setLiquidities] = useState<
    LiquidityProvision[] | undefined
  >(undefined)

  useEffect(() => {
    return listenForLiquidity(contractId, setLiquidities)
  }, [contractId])

  return liquidities
}
