import type { MentionOptions } from '@tiptap/extension-mention'
import { PluginKey } from 'prosemirror-state'
import { MentionList } from './contract-mention-list'
import { makeMentionRender } from './mention-suggestion'
import { trendingIndex } from 'web/lib/service/algolia'

type Suggestion = MentionOptions['suggestion']

export const contractMentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  allowedPrefixes: [' '],
  // Note (James): After recreating yarn.lock, this line had a type error, so I cast it to any...
  pluginKey: new PluginKey('contract-mention') as any,
  items: async ({ query }) =>
    (
      await trendingIndex.search(query, {
        hitsPerPage: 5,
        removeStopWords: true,
      })
    ).hits,
  render: makeMentionRender(MentionList),
}
