import { NodeViewWrapper } from '@tiptap/react'
import { TwitterTweetEmbed } from 'react-twitter-embed'

export default function WrappedTwitterTweetEmbed(props: any): JSX.Element {
  console.log('wtwe props', props.node.attrs)
  return (
    <NodeViewWrapper className="tiptap-tweet">
      <TwitterTweetEmbed
        tweetId={props.node.attrs.tweetId || '1557429814990196736'}
      />
    </NodeViewWrapper>
  )
}
