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
import { Spacer } from './layout/spacer'

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

  async function addContract(contract: Contract) {
    if (contracts.find((c) => c.id === contract.id) !== undefined) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  return (
    <Modal open={open} setOpen={setOpen} className={'sm:p-0'} size={'lg'}>
      <Col className="relative h-[85vh] w-full gap-4 rounded-md bg-white p-8">
        <div className={'pb-0 text-xl text-indigo-700'}>{title}</div>
        {description}
        <SelectMarkets
          submitLabel={submitLabel}
          onSubmit={onSubmit}
          contractSearchOptions={contractSearchOptions}
          setOpen={setOpen}
        />
      </Col>
    </Modal>
  )
}

export function SelectMarkets(props: {
  submitLabel: (length: number) => string
  onSubmit: (contracts: Contract[]) => void | Promise<void>
  contractSearchOptions?: Partial<Parameters<typeof ContractSearch>[0]>
  setOpen: (open: boolean) => void
}) {
  const { submitLabel, onSubmit, contractSearchOptions, setOpen } = props

  const privateUser = usePrivateUser()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)

  async function addContract(contract: Contract) {
    if (contracts.find((c) => c.id === contract.id) !== undefined) {
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
    <div className="grow overflow-y-auto px-1">
      {loading && (
        <div className="w-full justify-center">
          <LoadingIndicator />
        </div>
      )}
      <ContractSearch
        hideOrderSelector
        onContractClick={addContract}
        cardUIOptions={{
          hideGroupLink: true,
          hideQuickBet: true,
          noLinkAvatar: true,
        }}
        highlightCards={contracts.map((c) => c.id)}
        additionalFilter={{
          facetFilters: getUsersBlockFacetFilters(privateUser),
        }}
        headerClassName="bg-white"
        {...contractSearchOptions}
      />
      <Row className="fixed inset-x-0 bottom-0 z-40 justify-end bg-white px-8 py-2">
        {!loading && (
          <Row className="grow justify-end gap-4">
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
            <Button
              onClick={onFinish}
              color="indigo"
              disabled={contracts.length <= 0}
            >
              {contracts.length > 0
                ? submitLabel(contracts.length)
                : 'Add questions'}
            </Button>
          </Row>
        )}
      </Row>
    </div>
  )
}
