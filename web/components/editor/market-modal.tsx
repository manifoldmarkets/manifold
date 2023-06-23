import { Editor } from '@tiptap/react'
import { Contract } from 'common/contract'
import { SelectMarketsModal } from '../contract-select-modal'
import { embedContractCode } from '../buttons/share-embed-button'
import { insertContent } from './utils'

export function MarketModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props

  function onSubmit(contracts: Contract[]) {
    if (contracts.length == 1) {
      insertContent(editor, embedContractCode(contracts[0]))
    } else if (contracts.length > 1) {
      insertContent(
        editor,
        `<grid-cards-component contractIds="${contracts.map((c) => c.id)}" />`
      )
    }
  }

  return (
    <SelectMarketsModal
      title="Embed questions"
      open={open}
      setOpen={setOpen}
      submitLabel={(len) =>
        len == 1 ? 'Embed 1 question' : `Embed grid of ${len} questions`
      }
      onSubmit={onSubmit}
    />
  )
}
