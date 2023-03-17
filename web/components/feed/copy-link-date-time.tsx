import React from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { DateTimeTooltip } from 'web/components/widgets/datetime-tooltip'
import Link from 'next/link'
import { fromNow } from 'web/lib/util/time'
import { LinkIcon } from '@heroicons/react/outline'
import { useIsClient } from 'web/hooks/use-is-client'
import { toast } from 'react-hot-toast'
import { track } from 'web/lib/service/analytics'
import { ShareEvent } from 'common/events'

export function copyLinkToComment(
  contractCreatorUsername: string,
  contractSlug: string,
  commentId: string
) {
  const commentUrl = new URL(window.location.href)
  commentUrl.pathname = `/${contractCreatorUsername}/${contractSlug}`
  commentUrl.hash = commentId
  copyToClipboard(commentUrl.toString())
  toast('Link copied to clipboard!')
  track('copy comment link', {
    url: commentUrl.toString(),
    type: 'copy sharing link',
  } as ShareEvent)
}

export function CopyLinkDateTimeComponent(props: {
  prefix: string
  slug: string
  createdTime: number
  elementId: string
  className?: string
}) {
  const { prefix, slug, elementId, createdTime, className } = props
  const isClient = useIsClient()

  return (
    <DateTimeTooltip className={className} time={createdTime} noTap>
      <Link
        href={`/${prefix}/${slug}#${elementId}`}
        replace
        onClick={() => copyLinkToComment(prefix, slug, elementId)}
        className={
          'text-ink-400 hover:bg-ink-100 mx-1 whitespace-nowrap rounded-sm px-1 text-xs transition-colors'
        }
      >
        {isClient && fromNow(createdTime)}
        <LinkIcon className="ml-1 mb-0.5 inline" height={13} />
      </Link>
    </DateTimeTooltip>
  )
}
