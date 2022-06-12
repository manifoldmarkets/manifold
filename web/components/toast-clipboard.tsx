import { ClipboardCopyIcon } from '@heroicons/react/outline'
import React from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'

export function ToastClipboard(props: { className?: string }) {
  const { className } = props
  return (
    <Row
      className={clsx(
        'border-base-300 dark:border-gray-700 absolute items-center' +
          'gap-2 divide-x divide-gray-200 rounded-md border-2 bg-white dark:bg-black ' +
          'h-15 w-[15rem] p-2 pr-3 text-gray-500',
        className
      )}
    >
      <ClipboardCopyIcon height={20} className={'mr-2 self-center'} />
      <div className="pl-4 text-sm font-normal">Link copied to clipboard!</div>
    </Row>
  )
}
