import { Contract } from 'common/contract'
import { StateDataType } from './usa-map-data'
import { USAState } from './usa-state'
import { probToColor } from './state-election-map'
import { currentSenate } from 'common/politics/senate-state-data'

export type StateProps = {
  stateKey: string
  data: StateDataType
  stateContract: Contract | null
  hideStateTitle?: boolean
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | undefined | null
  hoveredState: string | undefined | null
}

export function SenateState(props: StateProps) {
  const {
    stateKey,
    data,
    stateContract,
    hideStateTitle,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
  } = props
  if (!!stateContract) {
    return (
      <USAState
        key={stateKey}
        stateData={data}
        hideStateTitle={hideStateTitle}
        state={stateKey}
        fill={probToColor(stateContract)}
        onClickState={() => {
          handleClick(stateKey)
        }}
        onMouseEnterState={() => {
          onMouseEnter(stateKey)
        }}
        onMouseLeaveState={() => {
          onMouseLeave()
        }}
        selected={!!targetState && targetState == stateKey}
        hovered={!!hoveredState && hoveredState == stateKey}
      />
    )
  }
  return (
    <USAState
      key={stateKey}
      stateData={data}
      hideStateTitle={hideStateTitle}
      state={stateKey}
      fill={getSenateFill(stateKey)}
      patternTextColor="#ffff"
      onClickState={() => {
        handleClick(stateKey)
      }}
      onMouseEnterState={() => {
        onMouseEnter(stateKey)
      }}
      onMouseLeaveState={() => {
        onMouseLeave()
      }}
      selected={!!targetState && targetState == stateKey}
      hovered={!!hoveredState && hoveredState == stateKey}
    />
  )
}

function getSenateFill(stateKey: string) {
  // Find the state in the currentSenate array
  const statesSenate = currentSenate.find((state) => state.state === stateKey)

  if (!statesSenate) return undefined // State not found

  // Determine fill based on party affiliation
  if (
    statesSenate.party1 === 'Democrat' &&
    statesSenate.party2 === 'Democrat'
  ) {
    return 'url(#crossHatchBlue)' // Assuming 'crossHatchBlue' is for Democrats
  } else if (
    statesSenate.party1 === 'Republican' &&
    statesSenate.party2 === 'Republican'
  ) {
    return 'url(#crossHatchRed)' // Assuming 'crossHatchRed' is for Republicans
  } else {
    return 'url(#crossHatchPurple)' // One of each party
  }
}
