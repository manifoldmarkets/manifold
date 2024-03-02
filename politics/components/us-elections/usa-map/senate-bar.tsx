import { DATA } from './usa-map-data'
import { Row } from 'web/components/layout/row'
import { DEM_DARK_HEX, probToColor } from './state-election-map'
import { Col } from 'web/components/layout/col'
import { ChevronDownIcon } from '@heroicons/react/solid'
import { HIGHLIGHTED_OUTLINE_COLOR, SELECTED_OUTLINE_COLOR } from './usa-map'
import clsx from 'clsx'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { MapContractsDictionary } from 'common/politics/elections-data'
import { currentSenate } from 'politics/public/data/senate-state-data'
import { partition } from 'lodash'
import { sortByDemocraticDiff } from './electoral-college-visual'
import { DEFAULT_STATE_FILL } from './usa-state'

export function SenateBar(props: {
  mapContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
}) {
  const sortedContractsDictionary = sortByDemocraticDiff(
    props.mapContractsDictionary
  )
  const { handleClick, onMouseEnter, onMouseLeave, targetState, hoveredState } =
    props

  const isMobile = useIsMobile()
  const [republicans, democrats] = partition(
    currentSenate,
    ({ party1 }) => party1 === 'Republican'
  )

  return (
    <Col className="mt-2 w-full font-mono text-xs sm:text-base">
      <Col className="text-ink-700 mx-auto items-center">
        <div className="-mb-1 ">50 to win</div>
        <ChevronDownIcon className="h-5 w-5" />
      </Col>
      <Row className="overflow-none relative gap-[1px] rounded sm:gap-0.5">
        {democrats.map(({ state }) => {
          return (
            <StateBar
              key={state}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetState}
              hoveredState={hoveredState}
              state={state}
              backgroundImage={`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Crect width='5' height='5' fill='%23e7dfe6'/%3E%3Cline x1='0' y1='0' x2='5' y2='5' stroke='%234a5fa8' stroke-width='1'/%3E%3Cline x1='5' y1='0' x2='0' y2='5' stroke='%234a5fa8' stroke-width='1'/%3E%3C/svg%3E")`}
              width={`${(1 / 50) * 100}%`}
              isMobile={isMobile}
            />
          )
        })}
        {Object.entries(sortedContractsDictionary).map(
          ([stateKey, contract], index) => {
            const fill = probToColor(contract) ?? ''
            return (
              <StateBar
                key={stateKey}
                handleClick={handleClick}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                targetState={targetState}
                hoveredState={hoveredState}
                state={stateKey}
                fill={fill}
                width={`${(1 / 50) * 100}%`}
                isMobile={isMobile}
              />
            )
          }
        )}
        {republicans.map(({ state }, index) => {
          return (
            <StateBar
              key={state}
              handleClick={handleClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              targetState={targetState}
              hoveredState={hoveredState}
              state={state}
              backgroundImage={`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='5' height='5'%3E%3Crect width='5' height='5' fill='%23e7dfe6'/%3E%3Cline x1='0' y1='0' x2='5' y2='5' stroke='%239d3336' stroke-width='1'/%3E%3Cline x1='5' y1='0' x2='0' y2='5' stroke='%239d3336' stroke-width='1'/%3E%3C/svg%3E")`}
              width={`${(1 / 50) * 100}%`}
              isMobile={isMobile}
            />
          )
        })}
      </Row>
    </Col>
  )
}

function StateBar(props: {
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | null | undefined
  hoveredState: string | null | undefined
  state: string
  fill?: string
  backgroundImage?: string
  width: string
  isMobile: boolean
}) {
  const {
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
    state,
    backgroundImage,
    fill,
    width,
    isMobile,
  } = props
  const selected = targetState === state
  const isHovered = hoveredState === state

  return (
    <div
      key={state}
      className="relative h-5 transition-all"
      style={{
        backgroundImage: backgroundImage,
        backgroundColor: fill,
        width: width,
        outline:
          isHovered || selected
            ? `${isMobile ? '1px' : '2px'} solid ${
                selected ? SELECTED_OUTLINE_COLOR : HIGHLIGHTED_OUTLINE_COLOR
              }`
            : 'none',
      }}
      onClick={() => handleClick(state)}
      onMouseEnter={() => onMouseEnter(state)}
      onMouseLeave={onMouseLeave}
    >
      {(isHovered || (selected && !hoveredState)) && (
        <Row
          className={clsx(
            '0 text-ink-700 absolute left-0 top-6 z-20 gap-1 rounded py-1 transition-all'
          )}
        >
          <div className="whitespace-nowrap font-semibold">{state}</div>
        </Row>
      )}
    </div>
  )
}
