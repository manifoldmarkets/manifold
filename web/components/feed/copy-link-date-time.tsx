import clsx from 'clsx'
import Link from 'next/link'
import { ReactNode } from 'react'
import { toast } from 'react-hot-toast'
import { DateTimeTooltip } from 'web/components/widgets/datetime-tooltip'
import { useIsClient } from 'web/hooks/use-is-client'
import { trackShareEvent } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'

export function copyLinkToComment(
  contractCreatorUsername: string,
  contractSlug: string,
  commentId: string
) {
  const commentUrl = getCommentLink(
    contractCreatorUsername,
    contractSlug,
    commentId
  )
  copyToClipboard(commentUrl)
  toast('Link copied to clipboard!')
  trackShareEvent('copy comment link', commentUrl)
}

export function getCommentLink(
  contractCreatorUsername: string,
  contractSlug: string,
  commentId: string
) {
  const commentUrl = new URL(window.location.href)
  commentUrl.pathname = `/${contractCreatorUsername}/${contractSlug}`
  commentUrl.hash = commentId
  return commentUrl.toString()
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
        {isClient && shortenedFromNow(createdTime)}
      </Link>
    </DateTimeTooltip>
  )
}
