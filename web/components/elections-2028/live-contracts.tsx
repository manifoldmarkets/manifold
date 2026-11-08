import { ReactNode, useCallback, useEffect, useState } from 'react'

import { Contract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'

// Live copies of a list of markets, for a picture drawn from several at once
// (a tile map, a grid, a list of lines): one useLiveContract per market, as
// the market cards had, batched into one fetch, each kept current by its own
// updates. Renders `children` with the live copies, in the given order.
export function LiveContracts(props: {
  contracts: Contract[]
  children: (live: Contract[]) => ReactNode
}) {
  const { contracts, children } = props
  const [updates, setUpdates] = useState<Record<string, Contract>>({})
  const onLive = useCallback(
    (c: Contract) =>
      setUpdates((u) => (u[c.id] === c ? u : { ...u, [c.id]: c })),
    []
  )
  const live = contracts.map((c) => updates[c.id] ?? c)
  return (
    <>
      {contracts.map((c) => (
        <Subscribe key={c.id} contract={c} onLive={onLive} />
      ))}
      {children(live)}
    </>
  )
}

function Subscribe(props: {
  contract: Contract
  onLive: (c: Contract) => void
}) {
  const { contract, onLive } = props
  const live = useLiveContract(contract)
  useEffect(() => {
    if (live !== contract) onLive(live)
  }, [live, contract, onLive])
  return null
}
