import clsx from 'clsx'
import TwitterLogo from 'web/lib/icons/twitter-logo'
import { trackCallback } from 'web/lib/service/analytics'
import { buttonClass } from './button'

export function TweetButton(props: { tweetText: string; className?: string }) {
  const { tweetText, className } = props

  return (
    <a
      // #1da1f2 is twitter blue
      className={clsx(
        buttonClass('2xs', 'override'),
        'gap-1 border-2 border-[#1da1f2] text-[#1da1f2] hover:bg-[#1da1f2] hover:text-white',
        className
      )}
      href={getTweetHref(tweetText)}
      onClick={trackCallback('share tweet')}
      target="_blank"
    >
      <TwitterLogo width={15} height={15} />
      <div>Tweet</div>
    </a>
  )
}

function getTweetHref(tweetText: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText ?? ''
  )}`
}
