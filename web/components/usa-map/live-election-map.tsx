import { useCallback, useEffect, useMemo, useState } from 'react'
import { Contract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { ElectionExplorer } from './election-explorer'

type Props = {
  rawSenateStateContracts: MapContractsDictionary
  rawGovernorStateContracts: MapContractsDictionary
  rawSenateCandidateContracts: MapContractsDictionary
  rawGovernorCandidateContracts: MapContractsDictionary
  houseDistrictsContract: Contract | null
  additionalHouseContracts?: MapContractsDictionary
  ballotMeasureContracts?: MapContractsDictionary
  houseControlContract: Contract | null
  senateControlContract: Contract | null
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

export function LiveElectionMap(props: Props) {
  const initial = useMemo(() => {
    const all = [
      ...Object.values(props.rawSenateStateContracts),
      ...Object.values(props.rawGovernorStateContracts),
      ...Object.values(props.rawSenateCandidateContracts),
      ...Object.values(props.rawGovernorCandidateContracts),
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
  const live = (c?: Contract | null) => (c ? updates[c.id] ?? c : null)
  const dictionary = (raw: MapContractsDictionary) =>
    Object.fromEntries(Object.entries(raw).map(([key, c]) => [key, live(c)]))
  return (
    <>
      {Object.values(initial).map((contract) => (
        <LiveMarket key={contract.id} contract={contract} onUpdate={onUpdate} />
      ))}
      <ElectionExplorer
        senate={dictionary(props.rawSenateStateContracts)}
        governor={dictionary(props.rawGovernorStateContracts)}
        senateCandidates={dictionary(props.rawSenateCandidateContracts)}
        governorCandidates={dictionary(props.rawGovernorCandidateContracts)}
        house={live(props.houseDistrictsContract)}
        additionalHouse={dictionary(props.additionalHouseContracts ?? {})}
        measures={dictionary(props.ballotMeasureContracts ?? {})}
        houseControl={live(props.houseControlContract)}
        senateControl={live(props.senateControlContract)}
      />
    </>
  )
}
