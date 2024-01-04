import clsx from 'clsx'
import { ClickHandler } from './usa-map'

type USAStateProps = {
  state: string
  dimensions: string
  fill: string
  onClickState?: ClickHandler
  stateName: string
  hideStateTitle?: boolean
  selected?: boolean
}
export const USAState = ({
  state,
  dimensions,
  fill,
  onClickState,
  stateName,
  hideStateTitle,
  selected,
}: USAStateProps) => {
  return (
    <>
      <path
        d={dimensions}
        fill={fill}
        data-name={state}
        className={clsx(!!onClickState && 'hover:cursor-pointer ')}
        onClick={onClickState}
        id={state}
        stroke={!!selected ? '#FFF' : undefined}
        strokeWidth={!!selected ? 2 : undefined}
      >
        {hideStateTitle ? null : <title>{stateName}</title>}
      </path>
    </>
  )
}
