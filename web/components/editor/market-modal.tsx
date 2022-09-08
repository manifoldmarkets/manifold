import { Editor } from '@tiptap/react'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { Button } from '../button'
import { ContractSearch } from '../contract-search'
import { Col } from '../layout/col'
import { Modal } from '../layout/modal'
import { Row } from '../layout/row'
import { LoadingIndicator } from '../loading-indicator'
import { embedContractCode, embedContractGridCode } from '../share-embed-button'
import { insertContent } from './utils'

export function MarketModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { editor, open, setOpen } = props

  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)

  async function addContract(contract: Contract) {
    if (contracts.map((c) => c.id).includes(contract.id)) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  async function doneAddingContracts() {
    setLoading(true)
    if (contracts.length == 1) {
      insertContent(editor, embedContractCode(contracts[0]))
    } else if (contracts.length > 1) {
      insertContent(editor, embedContractGridCode(contracts))
    }
    setLoading(false)
    setOpen(false)
    setContracts([])
  }

  return (
    <Modal open={open} setOpen={setOpen} className={'sm:p-0'} size={'lg'}>
      <Col className="h-[85vh] w-full gap-4 rounded-md bg-white">
        <Row className="p-8 pb-0">
          <div className={'text-xl text-indigo-700'}>Embed a market</div>

          {!loading && (
            <Row className="grow justify-end gap-4">
              {contracts.length == 1 && (
                <Button onClick={doneAddingContracts} color={'indigo'}>
                  Embed 1 question
                </Button>
              )}
              {contracts.length > 1 && (
                <Button onClick={doneAddingContracts} color={'indigo'}>
                  Embed grid of {contracts.length} question
                  {contracts.length > 1 && 's'}
                </Button>
              )}
              <Button
                onClick={() => {
                  if (contracts.length > 0) {
                    setContracts([])
                  } else {
                    setOpen(false)
                  }
                }}
                color="gray"
              >
                {contracts.length > 0 ? 'Reset' : 'Cancel'}
              </Button>
            </Row>
          )}
        </Row>

        {loading && (
          <div className="w-full justify-center">
            <LoadingIndicator />
          </div>
        )}

        <div className="overflow-y-scroll sm:px-8">
          <ContractSearch
            hideOrderSelector
            onContractClick={addContract}
            cardHideOptions={{ hideGroupLink: true, hideQuickBet: true }}
            highlightOptions={{
              contractIds: contracts.map((c) => c.id),
              highlightClassName:
                '!bg-indigo-100 outline outline-2 outline-indigo-300',
            }}
            additionalFilter={{}} /* hide pills */
            headerClassName="bg-white"
          />
        </div>
      </Col>
    </Modal>
  )
}
