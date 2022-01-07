import clsx from 'clsx'

export function TweetButton(props: { className?: string; tweetText?: string }) {
  const { tweetText, className } = props

  return (
    <a
      className={clsx('btn btn-xs normal-case border-none', className)}
      style={{ backgroundColor: '#1da1f2', width: 75 }}
      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
        tweetText ?? ''
      )}`}
      target="_blank"
    >
      <img
        className="mr-2"
        src={'/twitter-icon-white.svg'}
        width={15}
        height={15}
      />
      Tweet
    </a>
  )
}
