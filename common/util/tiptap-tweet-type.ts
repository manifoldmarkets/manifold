import { Node, mergeAttributes } from '@tiptap/core'

export interface TweetOptions {
  tweetId: string
}

// This is a version of the Tiptap Node config without addNodeView,
// since that would require bundling in tsx
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
