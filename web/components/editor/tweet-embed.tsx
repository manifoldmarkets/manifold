import { NodeViewWrapper } from '@tiptap/react'
import { TwitterTweetEmbed } from 'react-twitter-embed'

export default function WrappedTwitterTweetEmbed(props: {
  node: {
    attrs: {
      tweetId: string
    }
  }
}): JSX.Element {
  // Remove the leading 't' from the tweet id
  const tweetId = props.node.attrs.tweetId.slice(1)

  return (
    <NodeViewWrapper className="tiptap-tweet [&_.twitter-tweet]:mx-auto">
      <TwitterTweetEmbed tweetId={tweetId} />
    </NodeViewWrapper>
  )
}
