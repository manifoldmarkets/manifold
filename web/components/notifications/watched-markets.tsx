import { Contract } from 'common/contract'
import { User } from 'common/user'
import {
  MAX_WATCHED_MARKETS,
  WATCHED_MARKETS_PAGE_SIZE,
} from 'common/watched-markets'
import { memo, useCallback, useEffect, useState } from 'react'
import { unfollowMarket } from 'web/components/buttons/follow-market-button'
import { TextButton } from 'web/components/buttons/text-button'
import { Col } from 'web/components/layout/col'
import { Modal, SCROLLABLE_MODAL_CLASS } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { useDebouncedEffect } from 'web/hooks/use-debounced-effect'
import { usePagination } from 'web/hooks/use-pagination'
import { api } from 'web/lib/api/api'
import { withTracking } from 'web/lib/service/analytics'
import { Button } from '../buttons/button'
import {
  probColumn,
  traderColumn,
} from '../contract/contract-table-col-formats'
import { ContractsTable } from '../contract/contracts-table'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { PaginationNextPrev } from '../widgets/pagination'

export const UserWatchedContractsButton = memo(
  function UserLikedContractsButton(props: { user: User; className?: string }) {
    const { user, className } = props
    const [isOpen, setIsOpen] = useState(false)
    const [watchedContractsCount, setWatchedContractsCount] = useState<
      number | undefined
    >(undefined)
    const [queryInput, setQueryInput] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [refreshNonce, setRefreshNonce] = useState(0)

    useDebouncedEffect(
      () => {
        setSearchQuery(queryInput)
      },
      300,
      [queryInput]
    )

    const refreshCount = useCallback(async () => {
      const result = await api('get-watched-markets', {
        userId: user.id,
        limit: 0,
        offset: 0,
      })
      setWatchedContractsCount(result.totalCount)
    }, [user.id])

    useEffect(() => {
      refreshCount()
    }, [refreshCount])

    return (
      <>
        <TextButton
          onClick={withTracking(
            () => setIsOpen(true),
            'click user watched markets button'
          )}
          className={className}
        >
          <span className="font-semibold">{watchedContractsCount ?? ''}</span>{' '}
          Watched Markets
        </TextButton>
        <Modal
          open={isOpen}
          setOpen={setIsOpen}
          size="lg"
          className={SCROLLABLE_MODAL_CLASS}
        >
          <Col className="bg-canvas-0 w-full rounded p-6">
            <Row className={'mb-4 ml-2 items-center justify-between gap-4 '}>
              <span className={'whitespace-nowrap text-xl'}>
                Watched Markets
              </span>
              <Input
                placeholder="Search questions"
                className={' w-full'}
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
            </Row>
            <WatchedContractsTable
              key={`${searchQuery}-${refreshNonce}`}
              userId={user.id}
              searchQuery={searchQuery}
              onUnwatch={() => {
                setWatchedContractsCount((count) =>
                  count === undefined ? count : Math.max(0, count - 1)
                )
                setRefreshNonce((nonce) => nonce + 1)
              }}
            />
          </Col>
        </Modal>
      </>
    )
  }
)

function WatchedContractsTable(props: {
  userId: string
  searchQuery: string
  onUnwatch: () => void
}) {
  const { userId, searchQuery, onUnwatch } = props
  const q = useCallback(
    async (page: { limit: number; offset: number }) => {
      const result = await api('get-watched-markets', {
        userId,
        term: searchQuery || undefined,
        limit: page.limit,
        offset: page.offset,
      })
      return result.contracts
    },
    [userId, searchQuery]
  )

  const pagination = usePagination<Contract>({
    pageSize: WATCHED_MARKETS_PAGE_SIZE,
    q,
  })

  const noResults = pagination.isComplete && pagination.items.length === 0
  return (
    <Col className={'gap-4'}>
      {pagination.items.length > 0 && (
        <ContractsTable
          contracts={pagination.items}
          columns={[
            traderColumn,
            probColumn,
            {
              header: 'Unwatch',
              content: (props: { contract: Contract }) => {
                const { contract } = props
                return (
                  <Button
                    size="2xs"
                    color="gray-outline"
                    onClick={async (e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      await unfollowMarket(contract.id, contract.slug)
                      onUnwatch()
                    }}
                  >
                    Unwatch
                  </Button>
                )
              },
              width: 'w-16',
            },
          ]}
        />
      )}
      {!noResults && pagination.items.length === 0 && <LoadingIndicator />}
      {noResults && (
        <div className="text-ink-500 px-2">
          No watched markets found. You can watch up to {MAX_WATCHED_MARKETS}{' '}
          markets.
        </div>
      )}
      <PaginationNextPrev className="px-2 pb-2" {...pagination} />
    </Col>
  )
}
