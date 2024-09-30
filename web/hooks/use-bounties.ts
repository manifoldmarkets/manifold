import { Contract } from 'common/contract'
import { useState, useEffect } from 'react'
import { api } from 'web/lib/api/api'

export const useBountyAwardCount = (contract: Contract) => {
  const [count, setCount] = useState<number>(0)

  useEffect(() => {
    if (contract.outcomeType === 'BOUNTIED_QUESTION') {
      // TODO: count in api?
      Promise.all([
        api('txns', { fromId: contract.id, category: 'BOUNTY_AWARD' }),
        api('txns', { fromId: contract.id, category: 'BOUNTY_CANCELED' }),
      ]).then((results) => {
        setCount(results.flat().length)
      })
    }
  }, [contract.id])

  return count
}
