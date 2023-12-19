import clsx from 'clsx'
import { ClickHandler } from './usa-map'

type USAStateProps = {
  state: string
  dimensions: string
  fill: string
  onClickState?: ClickHandler
  stateName: string
  hideStateTitle?: boolean
}
export const USAState = ({
  state,
  dimensions,
  fill,
  onClickState,
  stateName,
  hideStateTitle,
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
      id={state}
    >
      {hideStateTitle ? null : <title>{stateName}</title>}
    </path>
  )
}
