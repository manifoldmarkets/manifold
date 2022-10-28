import type { MentionOptions } from '@tiptap/extension-mention'
import { PluginKey } from 'prosemirror-state'
import { searchInAny } from 'common/util/parse'
import { orderBy } from 'lodash'
import { getCachedContracts } from 'web/hooks/use-contracts'
import { MentionList } from './contract-mention-list'
import { makeMentionRender } from './mention-suggestion'

type Suggestion = MentionOptions['suggestion']

const beginsWith = (text: string, query: string) =>
  text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())

export const contractMentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  allowedPrefixes: [' '],
  // Note (James): After recreating yarn.lock, this line had a type error, so I cast it to any...
  pluginKey: new PluginKey('contract-mention') as any,
  items: async ({ query }) =>
    orderBy(
      (await getCachedContracts()).filter((c) =>
        searchInAny(query, c.question)
      ),
      [(c) => [c.question].some((s) => beginsWith(s, query))],
      ['desc', 'desc']
    ).slice(0, 5),
  render: makeMentionRender(MentionList),
}
