import clsx from 'clsx'
import { XIcon } from '@heroicons/react/solid'

import { getProbability } from 'common/calculate'
import { Contract } from 'common/contract'
import { formatPercent } from 'common/util/format'
import { memo } from 'react'
import { Button } from 'web/components/buttons/button'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { SupabaseContractSearch } from 'web/components/supabase-search'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { Input } from 'web/components/widgets/input'
import { Title } from 'web/components/widgets/title'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { usePrivateUser } from 'web/hooks/use-user'
import { useEvent } from 'web/hooks/use-event'
import { createPortfolio } from 'web/lib/firebase/api'

export default function Portfolio() {
  return (
    <Page>
      <CreatePortfolio />
    </Page>
  )
}

function CreatePortfolio() {
  const [name, setName] = usePersistentInMemoryState<string>(
    '',
    'create-portfolio-name'
  )
  const [contracts, setContracts] = usePersistentInMemoryState<Contract[]>(
    [],
    'create-portfolio-contract-ids'
  )

  const [positions, setPositions] = usePersistentInMemoryState<{
    [contractId: string]: 'YES' | 'NO'
  }>({}, 'create-portfolio-positions')

  const addContract = useEvent(async (contract: Contract) => {
    if (contracts.find((c) => c.id === contract.id) !== undefined) {
      setContracts(contracts.filter((c) => c.id !== contract.id))
    } else setContracts([...contracts, contract])
  })

  const onSubmit = async () => {
    const portfolio = {
      name,
      items: contracts.map((c) => ({
        contractId: c.id,
        position: positions[c.id] ?? 'YES',
      })),
    }
    const result = await createPortfolio(portfolio)
    console.log('result', result)
  }

  return (
    <Col className="relative gap-4">
      <Row className="items-start justify-between">
        <Title className="!mb-0">New portfolio</Title>
      </Row>

      <div className="text-ink-1000 text-sm">
        Choose questions for users to invest in with a Yes or No position in
        each.
      </div>
      <Col>
        <div className="text-ink-1000 mb-2 text-sm">Name</div>
        <Input
          className="max-w-[200px] border p-4"
          placeholder="Portfolio name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Col>

      <Col className="gap-4">
        <Col className="border p-4">
          {contracts.length === 0 ? (
            <div className="text-ink-1000 text-sm">No questions selected.</div>
          ) : (
            <table>
              <thead>
                <tr className="text-left">
                  <th className="text-ink-1000 text-sm">Question</th>
                  <th className="text-ink-1000 text-sm">Prob</th>
                  <th className="text-ink-1000 text-sm">Position</th>
                  <th className="text-ink-1000 text-sm"></th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="text-ink-1000 p-1">{c.question}</td>
                    <td className="text-ink-1000 p-1">
                      {c.mechanism === 'cpmm-1'
                        ? formatPercent(getProbability(c))
                        : ''}
                    </td>
                    <td className="p-1">
                      <ChoicesToggleGroup
                        currentChoice={positions[c.id] ?? 'YES'}
                        choicesMap={{
                          YES: 'YES',
                          NO: 'NO',
                        }}
                        setChoice={(choice) => {
                          setPositions((positions) => ({
                            ...positions,
                            [c.id]: choice as 'YES' | 'NO',
                          }))
                        }}
                      />
                    </td>
                    <td className="">
                      <Button
                        className="ml-2"
                        size="xs"
                        color="gray-outline"
                        onClick={() => {
                          setContracts(contracts.filter((c2) => c2.id !== c.id))
                        }}
                      >
                        <XIcon className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Col>
      </Col>

      <Button className="ml-auto" onClick={onSubmit}>
        Create portfolio
      </Button>

      <div className={clsx('mt-6 px-1')}>
        <ContractSearch contracts={contracts} addContract={addContract} />
      </div>
    </Col>
  )
}

const ContractSearch = memo(
  (props: {
    contracts: Contract[]
    addContract: (contract: Contract) => void
  }) => {
    const { contracts, addContract } = props
    const privateUser = usePrivateUser()

    return (
      <SupabaseContractSearch
        persistPrefix="contract-select-portfolio"
        hideOrderSelector
        onContractClick={addContract}
        highlightContractIds={contracts.map((c) => c.id)}
        additionalFilter={{
          excludeContractIds: [...(privateUser?.blockedContractIds ?? [])],
          excludeGroupSlugs: privateUser?.blockedGroupSlugs,
          excludeUserIds: privateUser?.blockedUserIds,
          contractType: 'BINARY',
        }}
        listUIOptions={{ hideActions: true }}
        hideFilters
        headerClassName={clsx('bg-canvas-0')}
      />
    )
  }
)
