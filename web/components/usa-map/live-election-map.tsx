import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Contract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { ElectionExplorer, ExplorerFocus } from './election-explorer'

export type LiveElectionMapProps = {
  rawSenateStateContracts: MapContractsDictionary
  rawGovernorStateContracts: MapContractsDictionary
  // Open markets linked to each race market, by that market's id.
  linkedMarketCounts?: Record<string, number>
  houseDistrictsContract: Contract | null
  additionalHouseContracts?: MapContractsDictionary
  ballotMeasureContracts?: MapContractsDictionary
  houseControlContract: Contract | null
  senateControlContract: Contract | null
}

// The map's markets with every live update applied, in the explorer's shape.
export type LiveElectionContracts = {
  senate: MapContractsDictionary
  governor: MapContractsDictionary
  house: Contract | null
  additionalHouse: MapContractsDictionary
  measures: MapContractsDictionary
  houseControl: Contract | null
  senateControl: Contract | null
}

// Isolate each subscription so missing or newly added markets never change
// hook order. One snapshot drives the map, seat totals, and race details.
function LiveMarket({
  contract,
  onUpdate,
}: {
  contract: Contract
  onUpdate: (contract: Contract) => void
}) {
  const live = useLiveContract(contract)
  useEffect(() => onUpdate(live), [live, onUpdate])
  return null
}

// Subscribes to every map market once. Render `subscriptions` anywhere on the
// page; `live` is what the explorer (and anything beside it, like Manifold
// TV's race list) reads, so they never disagree.
export function useLiveElectionMap(props: LiveElectionMapProps): {
  subscriptions: ReactNode
  live: LiveElectionContracts
} {
  const initial = useMemo(() => {
    const all = [
      ...Object.values(props.rawSenateStateContracts),
      ...Object.values(props.rawGovernorStateContracts),
      props.houseDistrictsContract,
      ...Object.values(props.additionalHouseContracts ?? {}),
      ...Object.values(props.ballotMeasureContracts ?? {}),
      props.houseControlContract,
      props.senateControlContract,
    ].filter((c): c is Contract => !!c)
    return Object.fromEntries(all.map((c) => [c.id, c]))
  }, [props])
  const [updates, setUpdates] = useState<Record<string, Contract>>({})
  const onUpdate = useCallback((contract: Contract) => {
    setUpdates((old) =>
      old[contract.id] === contract ? old : { ...old, [contract.id]: contract }
    )
  }, [])
  const live = useMemo(() => {
    const current = (c?: Contract | null) => (c ? updates[c.id] ?? c : null)
    const dictionary = (raw: MapContractsDictionary) =>
      Object.fromEntries(
        Object.entries(raw).map(([key, c]) => [key, current(c)])
      )
    return {
      senate: dictionary(props.rawSenateStateContracts),
      governor: dictionary(props.rawGovernorStateContracts),
      house: current(props.houseDistrictsContract),
      additionalHouse: dictionary(props.additionalHouseContracts ?? {}),
      measures: dictionary(props.ballotMeasureContracts ?? {}),
      houseControl: current(props.houseControlContract),
      senateControl: current(props.senateControlContract),
    }
  }, [props, updates])
  const subscriptions = Object.values(initial).map((contract) => (
    <LiveMarket key={contract.id} contract={contract} onUpdate={onUpdate} />
  ))
  return { subscriptions, live }
}

export function LiveElectionMap(props: LiveElectionMapProps) {
  const { subscriptions, live } = useLiveElectionMap(props)
  return (
    <>
      {subscriptions}
      <LiveElectionExplorer
        live={live}
        linkedMarketCounts={props.linkedMarketCounts}
      />
    </>
  )
}

// The explorer over contracts that are already live (useLiveElectionMap).
export function LiveElectionExplorer(props: {
  live: LiveElectionContracts
  linkedMarketCounts?: Record<string, number>
  focus?: ExplorerFocus
  hideControls?: boolean
  onSelect?: (race: string | undefined) => void
}) {
  const { live, linkedMarketCounts, focus, hideControls, onSelect } = props
  return (
    <ElectionExplorer
      senate={live.senate}
      governor={live.governor}
      linkedMarketCounts={linkedMarketCounts}
      house={live.house}
      additionalHouse={live.additionalHouse}
      measures={live.measures}
      houseControl={live.houseControl}
      senateControl={live.senateControl}
      focus={focus}
      hideControls={hideControls}
      onSelect={onSelect}
    />
  )
}
