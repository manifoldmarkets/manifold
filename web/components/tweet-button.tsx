import clsx from 'clsx'
import { trackCallback } from 'web/lib/service/analytics'

export function TweetButton(props: { className?: string; tweetText: string }) {
  const { tweetText, className } = props

  return (
    <a
      className={clsx('btn btn-xs flex-nowrap normal-case', className)}
      style={{
        backgroundColor: 'white',
        border: '2px solid #1da1f2',
        color: '#1da1f2',
      }}
      href={getTweetHref(tweetText)}
      onClick={trackCallback('share tweet')}
      target="_blank"
    >
      <img className="mr-2" src={'/twitter-logo.svg'} width={15} height={15} />
      <div>Tweet</div>
    </a>
  )
}

function getTweetHref(tweetText: string) {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText ?? ''
  )}`
}
