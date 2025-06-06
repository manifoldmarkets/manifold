import clsx from 'clsx'
import { Contract } from 'common/contract'
import { useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { Button } from './buttons/button'
import { Row } from './layout/row'
import { SupabaseAdditionalFilter, Search } from 'web/components/search'
import { Col } from './layout/col'

export function SelectMarkets(props: {
  submitLabel: (length: number) => string
  onSubmit: (contracts: Contract[]) => void | Promise<void>
  className?: string
  additionalFilter?: SupabaseAdditionalFilter
}) {
  const { submitLabel, onSubmit, className, additionalFilter } = props

  const privateUser = usePrivateUser()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)

  async function toggleContract(contract: Contract) {
    if (contracts.some((c) => c.id === contract.id)) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  }

  async function onFinish() {
    setLoading(true)
    await onSubmit(contracts)
    setLoading(false)
    setContracts([])
  }

  return (
    <Col className={clsx('bg-canvas-0 overflow-y-auto px-1', className)}>
      <Col className="max-h-[66vh] overflow-y-auto">
        <Search
          persistPrefix="contract-select-modal"
          onContractClick={toggleContract}
          hideActions
          highlightContractIds={contracts.map((c) => c.id)}
          additionalFilter={{
            excludeContractIds: [
              ...(additionalFilter?.excludeContractIds ?? []),
              ...(privateUser?.blockedContractIds ?? []),
            ],
            excludeGroupSlugs: privateUser?.blockedGroupSlugs,
            excludeUserIds: privateUser?.blockedUserIds,
          }}
          headerClassName={'!bg-canvas-0'}
          contractsOnly
          defaultFilter="all"
        />
      </Col>
      <Row className="justify-between pt-4">
        {!loading && (
          <>
            <Button
              onClick={() => {
                if (contracts.length > 0) {
                  setContracts([])
                } else {
                  onSubmit([])
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
              loading={loading}
            >
              {contracts.length > 0
                ? submitLabel(contracts.length)
                : 'Add questions'}
            </Button>
          </>
        )}
      </Row>
    </Col>
  )
}
