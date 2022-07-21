import clsx from 'clsx'
import { InformationCircleIcon } from '@heroicons/react/solid'

import { Linkify } from './linkify'

export function InfoBox(props: {
  title: string
  text: string
  className?: string
}) {
  const { title, text, className } = props
  return (
    <div className={clsx('rounded-md bg-gray-50 p-4', className)}>
      <div className="flex">
        <div className="flex-shrink-0">
          <InformationCircleIcon
            className="h-5 w-5 text-gray-400"
            aria-hidden="true"
          />
        </div>
        <div className="ml-3">
          <h3 className="text-sm font-medium text-black">{title}</h3>
          <div className="mt-2 text-sm text-black">
            <Linkify text={text} />
          </div>
        </div>
      </div>
    </div>
  )
}
