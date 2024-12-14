import clsx from 'clsx'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { groupBy, keyBy, orderBy, uniqBy } from 'lodash'
import { memo, useEffect, useState } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { ContractMention } from './contract/contract-mention'
import { FeedBet } from './feed/feed-bets'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { RelativeTimestamp } from './relative-timestamp'
import { Avatar } from './widgets/avatar'
import { Content } from './widgets/editor'
import { LoadingIndicator } from './widgets/loading-indicator'
import { UserLink } from './widgets/user-link'
import { UserHovercard } from './user/user-hovercard'
import { useAPIGetter } from 'web/hooks/use-api-getter'
import { VisibilityObserver } from './widgets/visibility-observer'

export function SiteActivity(props: {
  className?: string
  blockedUserIds?: string[]
}) {
  const { className } = props
  const privateUser = usePrivateUser()

  const blockedGroupSlugs = privateUser?.blockedGroupSlugs ?? []
  const blockedContractIds = privateUser?.blockedContractIds ?? []
  const blockedUserIds = (privateUser?.blockedUserIds ?? []).concat(
    props.blockedUserIds ?? []
  )

  const [offset, setOffset] = useState(0)
  const limit = 10
  
  const { data, loading } = useAPIGetter('get-site-activity', {
    limit,
    offset,
    blockedUserIds,
    blockedGroupSlugs,
    blockedContractIds,
  })

  const [allData, setAllData] = useState<typeof data>()

  useEffect(() => {
    if (data) {
      setAllData((prev) => {
        if (!prev) return data
        return {
          bets: uniqBy([...prev.bets, ...data.bets], 'id'),
          comments: uniqBy([...prev.comments, ...data.comments], 'id'),
          newContracts: uniqBy([...prev.newContracts, ...data.newContracts], 'id'),
          relatedContracts: uniqBy([...prev.relatedContracts, ...data.relatedContracts], 'id')
        }
      })
    }
  }, [data])

  if (!allData) return <LoadingIndicator />

  const { bets, comments, newContracts, relatedContracts } = allData
  const contracts = [...newContracts, ...relatedContracts]
  const contractsById = keyBy(contracts, 'id')

  const items = orderBy(
    [...bets, ...comments, ...newContracts],
    'createdTime',
    'desc'
  )

  const groups = orderBy(
    Object.entries(
      groupBy(items, (item) =>
        'contractId' in item ? item.contractId : item.id
      )
    ).map(([parentId, items]) => ({
      parentId,
      items,
    })),
    ({ items }) => Math.max(...items.map((item) => item.createdTime)),
    'desc'
  )

  return (
    <Col className={clsx('gap-4', className)}>
      <Col className="gap-4">
        {groups.map(({ parentId, items }) => {
          const contract = contractsById[parentId] as Contract

          return (
            <Col
              key={parentId}
              className="bg-canvas-0 border-canvas-50 hover:border-primary-300 gap-2 rounded-lg border px-4 py-3 transition-colors"
            >
              <Row className="gap-2">
                <Col className="flex-1 gap-2">
                  <ContractMention contract={contract} />
                  <div className="space-y-2">
                    {items.map((item, i) =>
                      'amount' in item ? (
                        <FeedBet
                          className="!pt-0"
                          key={item.id}
                          contract={contract}
                          bet={item}
                          avatarSize="xs"
                        />
                      ) : 'question' in item ? (
                        <MarketCreatedLog
                          key={item.id}
                          contract={item}
                          showDescription={items.length === 1}
                        />
                      ) : 'channelId' in item ? null : (
                        <CommentLog
                          key={item.id}
                          comment={item}
                          showDivider={i !== items.length - 1}
                        />
                      )
                    )}
                  </div>
                </Col>

                {contract.coverImageUrl && (
                  <img
                    src={contract.coverImageUrl}
                    alt=""
                    className={clsx(
                      'rounded-md object-cover',
                      'h-12 w-12 sm:h-32 sm:w-32',
                      // Only hide on desktop if single bet
                      items.length === 1 &&
                        'amount' in items[0] &&
                        'sm:hidden'
                    )}
                  />
                )}
              </Row>
            </Col>
          )
        })}
      </Col>
      <div className="relative">
        {loading && <LoadingIndicator />}
        <VisibilityObserver
          className="pointer-events-none absolute bottom-0 h-screen w-full select-none"
          onVisibilityUpdated={(visible) => {
            if (visible && !loading) {
              setOffset((prev: number) => prev + limit)
            }
          }}
        />
      </div>
    </Col>
  )
}

const MarketCreatedLog = memo(
  (props: { contract: Contract; showDescription?: boolean }) => {
    const {
      creatorId,
      creatorAvatarUrl,
      creatorUsername,
      creatorName,
      createdTime,
    } = props.contract
    const { showDescription = false } = props

    return (
      <Col className="gap-2">
        <Row className="text-ink-1000 items-center gap-2 text-sm">
          <UserHovercard userId={creatorId}>
            <Row className="items-center gap-2 font-semibold">
              <Avatar
                avatarUrl={creatorAvatarUrl}
                username={creatorUsername}
                size="xs"
              />
              <UserLink
                user={{
                  id: creatorId,
                  name: creatorName,
                  username: creatorUsername,
                }}
              />
            </Row>
          </UserHovercard>
          <div className="-ml-1">created this market</div>
          <Row className="text-ink-400">
            <RelativeTimestamp time={createdTime} shortened />
          </Row>
        </Row>

        {showDescription && props.contract.description && (
          <div className="relative max-h-[120px] max-w-xs overflow-hidden sm:max-w-none">
            <Content
              size="sm"
              content={props.contract.description}
              className="mt-2 text-left"
            />
            <div className="dark:from-canvas-0 absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white to-transparent" />
          </div>
        )}
      </Col>
    )
  }
)
// todo: add liking/disliking
const CommentLog = memo(function FeedComment(props: {
  comment: ContractComment
  showDivider?: boolean
}) {
  const { comment, showDivider = true } = props
  const {
    userName,
    text,
    content,
    userId,
    userUsername,
    userAvatarUrl,
    createdTime,
  } = comment

  return (
    <Col>
      <Row id={comment.id} className="mb-1 items-center gap-2 text-sm">
        <UserHovercard userId={userId}>
          <Row className="items-center gap-2 font-semibold">
            <Avatar
              avatarUrl={userAvatarUrl}
              username={userUsername}
              size="xs"
            />
            <UserLink
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
            />
          </Row>
        </UserHovercard>
        <div className="-ml-1">commented</div>
        <Row className="text-ink-400">
          <RelativeTimestamp time={createdTime} shortened />
        </Row>
      </Row>
      <Content size="sm" className="grow" content={content || text} />
      {showDivider && <div className="border-ink-200/30 mt-4 border-b" />}
    </Col>
  )
})
