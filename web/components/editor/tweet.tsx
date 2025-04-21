import { TiptapTweet } from 'common/util/tiptap-tweet'

import { NodeViewWrapper } from '@tiptap/react'
import { TwitterTweetEmbed } from 'react-twitter-embed'
import { PiXLogo } from 'react-icons/pi'

export const DisplayTweet = TiptapTweet.extend({
  renderReact: (attrs: any) => <TweetComponent {...attrs} />,
})

function TweetComponent(attrs: any) {
  // Remove the leading 't' from the tweet id
  const tweetId = attrs.tweetId.slice(1)

  return (
    <NodeViewWrapper className="tiptap-tweet [&_.twitter-tweet]:mx-auto">
      {/* <TweetPlaceholder /> */}
      <TwitterTweetEmbed tweetId={tweetId} placeholder={<TweetPlaceholder />} />
    </NodeViewWrapper>
  )
}

// Simple placeholder resembling a tweet structure
function TweetPlaceholder() {
  return (
    <div className="mx-auto h-[35rem] w-full animate-pulse rounded-lg border border-gray-200 bg-white p-1 shadow-sm  dark:border-gray-700 dark:bg-gray-800 sm:p-20">
      <div className="flex space-x-4">
        <div className="h-12 w-12 rounded-full bg-gray-300 dark:bg-gray-600"></div>
        <div className="flex-1 space-y-1">
          <div className="h-4 w-1/2 rounded bg-gray-300 dark:bg-gray-600"></div>
          <div className="h-3 w-1/4 rounded bg-gray-300 dark:bg-gray-600"></div>
        </div>
        <PiXLogo className="h-8 w-8" />
      </div>
      <div className="mt-4 space-y-4">
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 w-5/6 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 w-3/4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 w-4/5 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 w-2/3 rounded bg-gray-300 dark:bg-gray-600"></div>
        <div className="h-4 rounded bg-gray-300 dark:bg-gray-600"></div>
      </div>
    </div>
  )
}
