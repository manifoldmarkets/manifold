// https://github.com/jb-1980/usa-map-react
// MIT License

import clsx from 'clsx'
import { MultiContract } from 'common/contract'
import { MouseEvent } from 'react'
import { DATA } from './usa-map-data'
import { USAState } from './usa-state'
import { Col } from 'web/components/layout/col'
import { ElectoralCollegeVisual } from './electoral-college-visual'
import { Spacer } from 'web/components/layout/spacer'
import { MapContractsDictionary } from 'common/politics/elections-data'
import { probToColor } from './state-election-map'

export const SELECTED_OUTLINE_COLOR = '#00f7ff'
export const HIGHLIGHTED_OUTLINE_COLOR = '#00f7ffb3'

export type ClickHandler<
  E = SVGPathElement | SVGTextElement | SVGCircleElement,
  R = any
> = (e: React.MouseEvent<E, MouseEvent>) => R

export const USAMap = (props: {
  hideStateTitle?: boolean
  mapContractsDictionary: MapContractsDictionary
  handleClick: (newTargetState: string | undefined) => void
  onMouseEnter: (hoverState: string) => void
  onMouseLeave: () => void
  targetState: string | undefined | null
  hoveredState: string | undefined | null
}) => {
  const {
    hideStateTitle,
    mapContractsDictionary,
    handleClick,
    onMouseEnter,
    onMouseLeave,
    targetState,
    hoveredState,
  } = props

  return (
    <Col className="gap-2">
      <div
        className={clsx('relative w-full')}
        style={{ paddingTop: '61.75%' /* (593 / 959) * 100 */ }}
      >
        <svg
          className="absolute left-0 top-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 959 593"
          preserveAspectRatio="xMidYMid meet"
        >
          <g className="outlines">
            {Object.entries(DATA).map(([stateKey, data]) => {
              const stateContract = mapContractsDictionary[stateKey]
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
                  selected={!!targetState && targetState == stateKey}
                  hovered={!!hoveredState && hoveredState == stateKey}
              
                />
              )
            })}
          </g>
        </svg>
      </div>
    </Col>
  )
}
