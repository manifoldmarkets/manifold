import { Contract } from 'common/contract'
import { Row } from 'web/components/layout/row'
import clsx from 'clsx'
import { useGroupsWhereUserHasRole } from 'web/hooks/use-group-supabase'
import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'
import { ShowMoreLessButton } from 'web/components/widgets/collapsible-content'
import { useEffect, useState, useRef } from 'react'
import { useUser } from 'web/hooks/use-user'
import { PencilIcon, PlusIcon } from '@heroicons/react/solid'
import { Modal } from 'web/components/layout/modal'
import { Col } from 'web/components/layout/col'
import { ContractTopicsList } from 'web/components/topics/contract-topics-list'
import { useAdminOrTrusted } from 'web/hooks/use-admin'
import { filterDefined } from 'common/util/array'
import { Group, groupPath, Topic } from 'common/group'
import { track } from 'web/lib/service/analytics'
import { removeEmojis } from 'common/topics'
import { TopicTag } from 'web/components/topics/topic-tag'

export function MarketTopics(props: { contract: Contract; topics: Topic[] }) {
  const { contract, topics } = props
  if (contract.visibility === 'private') {
    return <PrivateMarketGroups contract={contract} />
  } else {
    return <PublicMarketTopics contract={contract} topics={topics} />
  }
}

function PrivateMarketGroups(props: { contract: Contract }) {
  const { contract } = props
  if (contract.groupLinks) {
    return (
      <div className="flex">
        <TopicTag
          location={'market page'}
          topic={contract.groupLinks[0]}
          isPrivate
        />
      </div>
    )
  }
  return <></>
}

const ContractTopicBreadcrumbs = (props: {
  contract: Contract
  topics: Topic[]
}) => {
  const { contract, topics } = props

  const spanRef = useRef<HTMLSpanElement>(null)
  const [isClamped, setClamped] = useState(true)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    function handleResize() {
      if (spanRef.current) {
        setClamped(spanRef.current.scrollHeight > spanRef.current.clientHeight)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [topics])

  return (
    <Col>
      <span
        ref={spanRef}
        className={clsx(['min-h-[24px]', { 'line-clamp-1': !showMore }])}
      >
        {topics.map((topic, i) => (
          <span key={topic.id} className={'text-primary-700 text-sm'}>
            <Link
              className={linkClass}
              href={groupPath(topic.slug)}
              onClick={() => {
                track('click category pill on market', {
                  contractId: contract.id,
                  categoryName: topic.name,
                })
              }}
            >
              {removeEmojis(topic.name)}
            </Link>
            {i !== topics.length - 1 && <span className="mx-1.5">{'•'}</span>}
          </span>
        ))}
      </span>
      {isClamped && (
        <Row className="justify-end">
          <ShowMoreLessButton
            isCollapsed={!showMore}
            onClick={() => setShowMore(!showMore)}
          />
        </Row>
      )}
    </Col>
  )
}

export function PublicMarketTopics(props: {
  contract: Contract
  topics: Topic[]
}) {
  const [open, setOpen] = useState(false)
  const { contract, topics } = props
  const user = useUser()
  const isCreator = contract.creatorId === user?.id
  const adminGroups = useGroupsWhereUserHasRole(user?.id)
  const isMod = useAdminOrTrusted()
  const canEdit = isMod || isCreator || (adminGroups && adminGroups.length > 0)
  const onlyGroups = !isMod && !isCreator ? adminGroups : undefined

  const canEditGroup = (group: Group) =>
    isCreator ||
    isMod ||
    // if user has admin role in that group
    !!(adminGroups && adminGroups.some((g) => g.group_id === group.id))
  return (
    <>
      <Row className={'group gap-1'}>
        <ContractTopicBreadcrumbs contract={contract} topics={topics} />
        {user && canEdit && (
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(true)
            }}
            className="hover:bg-primary-400/20 text-primary-700 rounded-md text-sm sm:invisible sm:group-hover:visible"
          >
            {contract.groupLinks?.length ? (
              <PencilIcon className="mx-1 h-4 w-4" />
            ) : (
              <span className={clsx('flex items-center px-1 text-sm')}>
                <PlusIcon className="mr-1 h-3 " /> Topics
              </span>
            )}
          </button>
        )}
      </Row>
      <Modal open={open} setOpen={setOpen} size={'md'}>
        <Col
          className={
            'bg-canvas-0 max-h-[70vh] min-h-[20rem] overflow-auto rounded p-6'
          }
        >
          <ContractTopicsList
            canEdit={!!canEdit}
            contract={contract}
            onlyGroupIds={
              onlyGroups
                ? filterDefined(onlyGroups.map((g) => g.group_id))
                : undefined
            }
            canEditGroup={canEditGroup}
          />
        </Col>
      </Modal>
    </>
  )
}
