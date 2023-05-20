import React, { ReactNode } from 'react'
import { copyToClipboard } from 'web/lib/util/copy'
import { DateTimeTooltip } from 'web/components/widgets/datetime-tooltip'
import Link from 'next/link'
import { fromNow } from 'web/lib/util/time'
import { LinkIcon } from '@heroicons/react/outline'
import { useIsClient } from 'web/hooks/use-is-client'
import { toast } from 'react-hot-toast'
import { trackShareEvent } from 'web/lib/service/analytics'
import clsx from 'clsx'

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
  trackShareEvent('copy comment link', commentUrl.toString())
}

export function CopyLinkDateTimeComponent(props: {
  prefix: string
  slug: string
  createdTime: number
  elementId: string
  className?: string
  seeEditsButton?: ReactNode
}) {
  const { prefix, seeEditsButton, slug, elementId, createdTime, className } =
    props
  const isClient = useIsClient()

  return (
    <DateTimeTooltip className={className} time={createdTime} noTap>
      {seeEditsButton}
      <Link
        href={`/${prefix}/${slug}#${elementId}`}
        replace
        onClick={() => copyLinkToComment(prefix, slug, elementId)}
        className={clsx(
          'text-ink-400 hover:bg-ink-100 mx-1 whitespace-nowrap rounded-sm text-xs transition-colors',
          seeEditsButton ? '' : 'px-1'
        )}
      >
        {isClient && fromNow(createdTime)}
        <LinkIcon className="ml-1 mb-0.5 inline" height={13} />
      </Link>
    </DateTimeTooltip>
  )
}
