import { Contract } from 'common/contract'
import { StateDataType } from './usa-map-data'
import { USAState } from './usa-state'
import { probToColor } from './state-election-map'
import { StateProps } from './presidential-state'

export function GovernorState(props: StateProps) {
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
      fill={'#76769366'}
    />
  )
}
