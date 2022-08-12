import { Node, mergeAttributes } from '@tiptap/core'

export interface TweetOptions {
  tweetId: string
}

// This export excludes addNodeView, since that require tsx,
// which common/ does not support transpilation of.
export const TiptapTweetNode = {
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

  renderHTML(props: { HTMLAttributes: Record<string, any> }) {
    return ['tiptap-tweet', mergeAttributes(props.HTMLAttributes)]
  },
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default Node.create<TweetOptions>(TiptapTweetNode)
