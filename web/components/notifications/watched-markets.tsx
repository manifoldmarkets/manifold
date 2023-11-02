import { useEffect, useState } from 'react'
import { TextButton } from 'web/components/buttons/text-button'
import { withTracking } from 'web/lib/service/analytics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import {
  getWatchedContracts,
  getWatchedContractsCount,
} from 'web/lib/supabase/contracts'
import { unfollowMarket } from 'web/components/buttons/follow-market-button'
import { ContractsTable } from '../contract/contracts-table'
import {
  probColumn,
  traderColumn,
} from '../contract/contract-table-col-formats'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { Button } from '../buttons/button'
import { useUser } from 'web/hooks/use-user'
import { Title } from '../widgets/title'

export const BookmarkedContractsButton = (props: { className?: string }) => {
  const { className } = props
  const user = useUser()
  const [isOpen, setIsOpen] = useState(false)

  const [watchedContracts, setWatchedContracts] = useState<
    Awaited<ReturnType<typeof getWatchedContracts>> | undefined
  >(undefined)
  const [watchedContractsCount, setWatchedContractsCount] = useState(0)
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (user) getWatchedContractsCount(user.id).then(setWatchedContractsCount)
  }, [user?.id])

  useEffect(() => {
    if (!user || !isOpen || watchedContracts !== undefined) return
    getWatchedContracts(user.id).then(setWatchedContracts)
  }, [watchedContracts, isOpen, user?.id])

  // filter by query
  const filteredWatchedContracts = watchedContracts?.filter((c) => {
    return (
      query === '' || c.question.toLowerCase().includes(query.toLowerCase())
    )
  })

  if (!user) return null

  return (
    <>
      <TextButton
        onClick={withTracking(
          () => setIsOpen(true),
          'click user watched markets button'
        )}
        className={className}
      >
        <span className="font-semibold">
          {watchedContractsCount > 0 ? watchedContractsCount : ''}
        </span>{' '}
        Bookmarked Questions
      </TextButton>
      <Modal open={isOpen} setOpen={setIsOpen} size={'lg'}>
        <Col className="bg-canvas-0 rounded p-6">
          <Row className={'mb-4 ml-2 items-center justify-between gap-4'}>
            <Title className="!mb-0">Boomarked questions</Title>
            <Input
              placeholder="Search"
              className={'w-42'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </Row>
          <Col className={'gap-4'}>
            {!filteredWatchedContracts && <LoadingIndicator />}
            <ContractsTable
              contracts={filteredWatchedContracts ?? ([] as any)}
              hideHeader
              columns={[
                traderColumn,
                probColumn,
                {
                  header: 'Remove bookmark',
                  content: (contract) => (
                    <Button
                      size="2xs"
                      color="gray-outline"
                      onClick={async (e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        await unfollowMarket(contract.id, contract.slug, user)
                        setWatchedContracts(
                          filteredWatchedContracts?.filter(
                            (c) => c.id !== contract.id
                          )
                        )
                        setWatchedContractsCount(watchedContractsCount - 1)
                      }}
                    >
                      Remove
                    </Button>
                  ),
                },
              ]}
            />
          </Col>
        </Col>
      </Modal>
    </>
  )
}
