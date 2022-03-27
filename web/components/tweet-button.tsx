import clsx from 'clsx'

export function TweetButton(props: { className?: string; tweetText?: string }) {
  const { tweetText, className } = props

  return (
    <a
      className={clsx('btn btn-xs flex-nowrap normal-case', className)}
      style={{
        backgroundColor: 'white',
        border: '2px solid #1da1f2',
        color: '#1da1f2',
      }}
      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
        tweetText ?? ''
      )}`}
      target="_blank"
    >
      <img className="mr-2" src={'/twitter-logo.svg'} width={15} height={15} />
      <div>Tweet</div>
    </a>
  )
}
