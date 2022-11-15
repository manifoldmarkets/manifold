import { InformationCircleIcon } from '@heroicons/react/outline'
import { ReactNode } from 'react'
import { Tooltip } from './tooltip'

export function InfoTooltip(props: { text: string | ReactNode }) {
  const { text } = props
  return (
    <Tooltip className="inline-block" text={text}>
      <InformationCircleIcon className="-mb-1 h-5 w-5 text-gray-500" />
    </Tooltip>
  )
}
