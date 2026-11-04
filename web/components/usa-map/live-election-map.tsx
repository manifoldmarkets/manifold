import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Contract } from 'common/contract'
import { useLiveContract } from 'web/hooks/use-contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { track } from 'web/lib/service/analytics'
import { ElectionAsOfContext } from './election-as-of'
import { ElectionExplorer, ExplorerFocus } from './election-explorer'
import { frameAt, liveAsOf, rewindContractIds } from './election-rewind-model'
import { RewindBar, RewindButton, useRewindHistory } from './election-rewind'

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
  // The rewind: the same map at an earlier frame, or live when undefined.
  const [rewinding, setRewinding] = useState(false)
  // The frame time shown; undefined is live.
  const [asOf, setAsOf] = useState<number>()
  const ids = useMemo(() => rewindContractIds(live), [live])
  const { history, error, retry } = useRewindHistory(ids, rewinding)
  const shownFrame =
    rewinding && history && asOf !== undefined
      ? frameAt(history.times, asOf)
      : undefined
  const shown = useMemo(
    () =>
      history && shownFrame !== undefined
        ? liveAsOf(live, history, shownFrame)
        : live,
    [live, history, shownFrame]
  )
  return (
    <>
      {subscriptions}
      <ElectionAsOfContext.Provider
        value={
          history && shownFrame !== undefined
            ? history.times[shownFrame]
            : undefined
        }
      >
        <LiveElectionExplorer
          live={shown}
          linkedMarketCounts={props.linkedMarketCounts}
          tools={
            <RewindButton
              open={rewinding}
              onToggle={() => {
                if (!rewinding) track('election map rewind', { action: 'open' })
                setRewinding(!rewinding)
                setAsOf(undefined)
              }}
            />
          }
          timeline={
            rewinding && (
              <RewindBar
                history={history}
                error={error}
                onRetry={retry}
                asOf={asOf}
                setAsOf={setAsOf}
              />
            )
          }
        />
      </ElectionAsOfContext.Provider>
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
  hideDetails?: boolean
  tools?: ReactNode
  timeline?: ReactNode
}) {
  const {
    live,
    linkedMarketCounts,
    focus,
    hideControls,
    onSelect,
    hideDetails,
    tools,
    timeline,
  } = props
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
      hideDetails={hideDetails}
      tools={tools}
      timeline={timeline}
    />
  )
}
