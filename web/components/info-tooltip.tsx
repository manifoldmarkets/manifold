import { InformationCircleIcon } from '@heroicons/react/outline'
import { Tooltip } from './tooltip'

export function InfoTooltip(props: { text: string }) {
  const { text } = props
  return (
    <Tooltip text={text}>
      <InformationCircleIcon className="h-5 w-5 text-gray-500" />
    </Tooltip>
  )
}
