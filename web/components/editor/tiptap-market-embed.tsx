import { mergeAttributes, Node } from '@tiptap/core'
import { LoadableContractEmbed } from 'web/pages/embed/[username]/[contractSlug]'

export default Node.create({
  name: 'market-embed',
  group: 'block',
  atom: true,

  addAttributes: () => ({ contractId: '' }),
  parseHTML: () => [{ tag: 'market-embed ' }],
  renderHTML: ({ HTMLAttributes }) => [
    'market-embed',
    mergeAttributes(HTMLAttributes),
  ],

  renderReact: (attrs: any) => <LoadableContractEmbed {...attrs} />,
})
