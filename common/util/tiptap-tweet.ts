import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import WrappedTwitterTweetEmbed from './tweet-embed'

export interface TweetOptions {
  tweetId: string
}

export default Node.create<TweetOptions>({
  name: 'tiptapTweet',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      tweetId: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'tiptap-tweet',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['tiptap-tweet', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(WrappedTwitterTweetEmbed)
  },
})
