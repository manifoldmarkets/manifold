import clsx from 'clsx'
import { ClickHandler, MouseEventHandler } from './usa-map'

type USAStateProps = {
  state: string
  dimensions: string
  fill: string
  onClickState?: ClickHandler
  onMouseEnter?: MouseEventHandler
  onMouseLeave?: MouseEventHandler
  stateName: string
  hideStateTitle?: boolean
}
export const USAState = ({
  state,
  dimensions,
  fill,
  onClickState,
  onMouseEnter,
  onMouseLeave,
}: USAStateProps) => {
  return (
    <path
      d={dimensions}
      fill={fill}
      data-name={state}
      className={clsx(
        !!onClickState && 'hover:cursor-pointer hover:contrast-125'
      )}
      onClick={onClickState}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      id={state}
    ></path>
  )
}
