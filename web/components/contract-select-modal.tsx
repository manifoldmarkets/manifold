import { Contract } from 'common/contract'
import { useState } from 'react'
import { Button } from './buttons/button'
import { ContractSearch } from './contract-search'
import { Col } from './layout/col'
import { Modal } from './layout/modal'
import { Row } from './layout/row'
import { LoadingIndicator } from './widgets/loading-indicator'
import { usePrivateUser } from 'web/hooks/use-user'
import { getUsersBlockFacetFilters } from 'web/lib/firebase/users'

export function SelectMarketsModal(props: {
  title: string
  description?: React.ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  submitLabel: (length: number) => string
  onSubmit: (contracts: Contract[]) => void | Promise<void>
  contractSearchOptions?: Partial<Parameters<typeof ContractSearch>[0]>
}) {
  const {
    title,
    description,
    open,
    setOpen,
    submitLabel,
    onSubmit,
    contractSearchOptions,
  } = props

  const privateUser = usePrivateUser()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)

  async function addContract(contract: Contract) {
    if (contracts.map((c) => c.id).includes(contract.id)) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  async function onFinish() {
    setLoading(true)
    await onSubmit(contracts)
    setLoading(false)
    setOpen(false)
    setContracts([])
  }

  return (
    <Modal open={open} setOpen={setOpen} className={'sm:p-0'} size={'lg'}>
      <Col className="h-[85vh] w-full gap-4 rounded-md bg-white">
        <div className="p-8 pb-0">
          <Row>
            <div className={'text-xl text-indigo-700'}>{title}</div>

            {!loading && (
              <Row className="grow justify-end gap-4">
                {contracts.length > 0 && (
                  <Button onClick={onFinish} color="indigo">
                    {submitLabel(contracts.length)}
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
          {description}
        </div>

        {loading && (
          <div className="w-full justify-center">
            <LoadingIndicator />
          </div>
        )}

        <div className="grow overflow-y-auto px-2 sm:px-8">
          <ContractSearch
            hideOrderSelector
            onContractClick={addContract}
            cardUIOptions={{
              hideGroupLink: true,
              hideQuickBet: true,
              noLinkAvatar: true,
            }}
            highlightOptions={{
              itemIds: contracts.map((c) => c.id),
              highlightClassName:
                '!bg-indigo-100 outline outline-2 outline-indigo-300',
            }}
            additionalFilter={{
              facetFilters: getUsersBlockFacetFilters(privateUser),
            }}
            headerClassName="bg-white sticky"
            {...contractSearchOptions}
          />
        </div>
      </Col>
    </Modal>
  )
}
