import { LinkIcon } from '@heroicons/react/outline'
import toast from 'react-hot-toast'
import { ENV_CONFIG } from 'common/envs/constants'
import { referralQuery } from 'common/util/share'
import { useNativeInfo } from 'web/components/native-message-provider'
import { Tooltip } from 'web/components/widgets/tooltip'
import { useUser } from 'web/hooks/use-user'
import { trackShareEvent } from 'web/lib/service/analytics'
import { copyToClipboard } from 'web/lib/util/copy'
import { buildShareUrl } from 'web/lib/util/share-url'

/**
 * Copies a link to exactly what's open: the sport or topic page and its tab,
 * with the sharer's referral code when they're signed in, so sign-ups from
 * the link are credited. In the app it opens the share sheet. Icon-only on
 * phones, like the Follow button beside it.
 */
export function SportsShareButton() {
  const user = useUser()
  const { isNative } = useNativeInfo()

  const share = () => {
    // Read at click time: the tab lives in the URL and changes without a
    // re-render here.
    const link = buildShareUrl({
      domain: ENV_CONFIG.domain,
      pathname: window.location.pathname,
      search: window.location.search,
      referralQuery: user?.username ? referralQuery(user.username) : undefined,
    })
    copyToClipboard(link)
    if (!isNative) toast.success('Link copied!')
    trackShareEvent('copy sports share link', link)
  }

  return (
    <Tooltip text="Copy link" noTap placement="bottom">
      <button
        type="button"
        onClick={share}
        className="border-ink-200 bg-canvas-0 text-ink-700 hover:bg-canvas-50 flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors sm:px-3"
      >
        <LinkIcon className="h-4 w-4" aria-hidden />
        <span className="sr-only sm:not-sr-only">Share</span>
      </button>
    </Tooltip>
  )
}
