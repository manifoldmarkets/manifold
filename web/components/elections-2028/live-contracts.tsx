import { ReactNode, useCallback, useEffect, useState } from 'react'

import { Contract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import {
  fresherContract,
  keepNewer,
  snapshotKey,
} from 'web/lib/politics/fresher-contract'

// Live copies of a list of markets, for a picture drawn from several at once
// (a tile map, a grid, a list of lines): one useLiveContract per market, as
// the market cards had, batched into one fetch, each kept current by its own
// updates. Renders `children` with the live copies, in the given order.
// Keep a market in one list at a time: two lists would subscribe twice.
// Pass a list's live copies down to plain OddsRows rather than wrapping
// them again.
export function LiveContracts(props: {
  contracts: Contract[]
  children: (live: Contract[]) => ReactNode
}) {
  const { contracts, children } = props
  const [updates, setUpdates] = useState<Record<string, Contract>>({})
  const onLive = useCallback(
    (c: Contract) =>
      setUpdates((u) => {
        const kept = keepNewer(u[c.id], c)
        return u[c.id] === kept ? u : { ...u, [c.id]: kept }
      }),
    []
  )
  const live = contracts.map((c) => fresherContract(updates[c.id], c))
  return (
    <>
      {contracts.map((c) => (
        <Subscribe key={snapshotKey(c)} contract={c} onLive={onLive} />
      ))}
      {children(live)}
    </>
  )
}

// One market's live copy, reported through `onLive` (renders nothing), for a
// component that needs a live market in its own state.
export function Subscribe(props: {
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
