export function TweetButton(props: { tweetText?: string }) {
  const { tweetText } = props

  return (
    <a
      className="btn btn-sm normal-case self-start border-none"
      style={{ backgroundColor: '#1da1f2' }}
      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
        tweetText ?? ''
      )}`}
      target="_blank"
    >
      <img
        className="mr-2"
        src={'/twitter-icon-white.svg'}
        width={18}
        height={18}
      />
      Tweet
    </a>
  )
}
