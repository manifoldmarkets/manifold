import React, { useState } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { DateTimeTooltip } from 'web/components/datetime-tooltip'
import Link from 'next/link'
import { fromNow } from 'web/lib/util/time'
import { ToastClipboard } from 'web/components/toast-clipboard'
import { LinkIcon } from '@heroicons/react/outline'

export function CopyLinkDateTimeComponent(props: {
  prefix: string
  slug: string
  createdTime: number
  elementId: string
  className?: string
}) {
  const { prefix, slug, elementId, createdTime, className } = props
  const [showToast, setShowToast] = useState(false)

  function copyLinkToComment(
    event: React.MouseEvent<HTMLAnchorElement, MouseEvent>
  ) {
    event.preventDefault()
    const commentUrl = new URL(window.location.href)
    commentUrl.pathname = `/${prefix}/${slug}`
    commentUrl.hash = elementId
    copyToClipboard(commentUrl.toString())
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }
  return (
    <DateTimeTooltip className={className} time={createdTime} noTap>
      <Link href={`/${prefix}/${slug}#${elementId}`} passHref={true}>
        <a
          onClick={copyLinkToComment}
          className={
            'text-greyscale-4 hover:bg-greyscale-1.5 mx-1 whitespace-nowrap rounded-sm px-1 text-xs transition-colors'
          }
        >
          {fromNow(createdTime)}
          {showToast && <ToastClipboard />}
          <LinkIcon className="ml-1 mb-0.5 inline" height={13} />
        </a>
      </Link>
    </DateTimeTooltip>
  )
}
