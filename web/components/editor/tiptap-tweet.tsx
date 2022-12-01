import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TiptapTweetNode } from 'common/util/tiptap-tweet-type'
import WrappedTwitterTweetEmbed from './tweet-embed'

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default Node.create<TweetOptions>({
  ...TiptapTweetNode,
  addNodeView() {
    return ReactNodeViewRenderer(WrappedTwitterTweetEmbed)
  },
})
