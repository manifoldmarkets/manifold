import { ClipboardCopyIcon } from '@heroicons/react/outline'
import React from 'react'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'

export function ToastClipboard(props: { className?: string }) {
  const { className } = props
  return (
    <Row
      className={clsx(
        'absolute items-center border-gray-400' +
          'gap-2 divide-x divide-gray-200 rounded-md border-2 bg-white ' +
          'h-15 z-10 w-[15rem] p-2 pr-3 text-gray-500',
        className
      )}
    >
      <ClipboardCopyIcon height={20} className={'mr-2 self-center'} />
      <div className="pl-4 text-sm font-normal">Link copied to clipboard!</div>
    </Row>
  )
}
