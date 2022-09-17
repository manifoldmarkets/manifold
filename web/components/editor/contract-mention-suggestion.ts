import type { MentionOptions } from '@tiptap/extension-mention'
import { searchInAny } from 'common/util/parse'
import { orderBy } from 'lodash'
import { getCachedContracts } from 'web/hooks/use-contracts'
import { MentionList } from './contract-mention-list'
import { PluginKey } from 'prosemirror-state'
import { makeMentionRender } from './mention-suggestion'

type Suggestion = MentionOptions['suggestion']

const beginsWith = (text: string, query: string) =>
  text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())

export const contractMentionSuggestion: Suggestion = {
  char: '%',
  allowSpaces: true,
  pluginKey: new PluginKey('contract-mention'),
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
