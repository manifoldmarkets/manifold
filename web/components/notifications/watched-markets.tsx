import { memo, useEffect, useState } from 'react'
import { User } from 'common/user'
import { TextButton } from 'web/components/buttons/text-button'
import { withTracking } from 'web/lib/service/analytics'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { SiteLink } from 'web/components/widgets/site-link'
import { XIcon } from '@heroicons/react/outline'
import {
  getWatchedContracts,
  getWatchedContractsCount,
} from 'web/lib/supabase/contracts'
import { unfollowMarket } from 'web/components/buttons/follow-market-button'

export const UserWatchedContractsButton = memo(
  function UserLikedContractsButton(props: { user: User; className?: string }) {
    const { user, className } = props
    const [isOpen, setIsOpen] = useState(false)

    const [watchedContracts, setWatchedContracts] = useState<
      Awaited<ReturnType<typeof getWatchedContracts>> | undefined
    >(undefined)
    const [watchedContractsCount, setWatchedContractsCount] = useState(0)
    const [query, setQuery] = useState('')
    useEffect(() => {
      getWatchedContractsCount(user.id).then(setWatchedContractsCount)
    }, [user.id])

    useEffect(() => {
      if (!isOpen || watchedContracts !== undefined) return
      getWatchedContracts(user.id).then(setWatchedContracts)
    }, [watchedContracts, isOpen, user.id])

    // filter by query
    const filteredWatchedContracts = watchedContracts?.filter((c) => {
      return (
        query === '' || c.question.toLowerCase().includes(query.toLowerCase())
      )
    })

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
          Watched Questions
        </TextButton>
        <Modal open={isOpen} setOpen={setIsOpen} size={'lg'}>
          <Col className="bg-canvas-0 rounded p-6">
            <Row className={'ml-2 mb-4 items-center justify-between gap-4 '}>
              <span className={'text-xl'}>Watched questions</span>
              <Input
                placeholder="Search questions"
                className={' w-42'}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </Row>
            <Col className={'gap-4'}>
              {filteredWatchedContracts?.map((watchedContract) => (
                <Row
                  key={watchedContract.slug}
                  className={'items-center justify-between gap-2'}
                >
                  <Col className={'w-full'}>
                    <SiteLink
                      href={
                        watchedContract.creatorUsername +
                        '/' +
                        watchedContract.slug
                      }
                      className={'line-clamp-2 text-primary-700 text-sm'}
                    >
                      {watchedContract.question}
                    </SiteLink>
                  </Col>
                  <XIcon
                    className="ml-2 h-5 w-5 shrink-0 cursor-pointer"
                    onClick={async () => {
                      await unfollowMarket(
                        watchedContract.id,
                        watchedContract.slug,
                        user
                      )
                      setWatchedContracts(
                        filteredWatchedContracts.filter(
                          (c) => c.id !== watchedContract.id
                        )
                      )
                      setWatchedContractsCount(watchedContractsCount - 1)
                    }}
                  />
                </Row>
              ))}
            </Col>
          </Col>
        </Modal>
      </>
    )
  }
)
