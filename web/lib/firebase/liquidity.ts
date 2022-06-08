import { collection, query } from 'firebase/firestore'

import { db } from './init'
import { listenForValues } from './utils'
import { LiquidityProvision } from 'common/liquidity-provision'

export function listenForLiquidity(
  contractId: string,
  setLiquidity: (lps: LiquidityProvision[]) => void
) {
  const lpQuery = query(collection(db, 'contracts', contractId, 'liquidity'))

  return listenForValues<LiquidityProvision>(lpQuery, (lps) => {
    lps.sort((lp1, lp2) => lp1.createdTime - lp2.createdTime)
    setLiquidity(lps)
  })
}
