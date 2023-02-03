import type { MentionOptions } from '@tiptap/extension-mention'
import { PluginKey } from 'prosemirror-state'
import { searchClient, searchIndexName } from 'web/lib/service/algolia'
import { MentionList } from './contract-mention-list'
import { makeMentionRender } from '../user-mention/mention-suggestion'

type Suggestion = MentionOptions['suggestion']

const index = searchClient.initIndex(searchIndexName)

export const contractMentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  allowedPrefixes: [' '],
  // exit if space right after % symbol
  allow: ({ state, range }) => {
    return state.doc.textBetween(range.from + 1, range.from + 2) !== ' '
  },
  pluginKey: new PluginKey('contract-mention'),
  items: async ({ query }) =>
    (
      await index.search(query, {
        hitsPerPage: 5,
        removeStopWords: true,
      })
    ).hits,
  render: makeMentionRender(MentionList),
}
