import { Tooltip } from './tooltip'

const FORMATTER = new Intl.DateTimeFormat('default', {
  dateStyle: 'medium',
  timeStyle: 'long',
})

export function DateTimeTooltip(props: {
  time: number
  text?: string
  className?: string
  children?: React.ReactNode
  noTap?: boolean
}) {
  const { className, time, text, noTap } = props

  const formattedTime = FORMATTER.format(time)
  const toolTip = text ? `${text} ${formattedTime}` : formattedTime

  return (
    <Tooltip className={className} text={toolTip} noTap={noTap}>
      {props.children}
    </Tooltip>
  )
}
