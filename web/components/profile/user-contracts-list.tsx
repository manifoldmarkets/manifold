import clsx from 'clsx'
import { getUnresolvedContractsCount } from 'common/supabase/contracts'
import { User } from 'common/user'
import { formatWithCommas } from 'common/util/format'
import { ReactNode, useEffect, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { Tooltip } from 'web/components/widgets/tooltip'
import {
  getCreatorRank,
  getTotalContractsCreated,
} from 'web/lib/supabase/users'
import { db } from 'web/lib/supabase/db'
import { SupabaseSearch } from 'web/components/supabase-search'
import { useUser } from 'web/hooks/use-user'
import { CreateQuestionButton } from '../buttons/create-question-button'
import { useRouter } from 'next/router'

export function UserContractsList(props: { creator: User }) {
  const { creator } = props
  const { creatorTraders } = creator
  const { weekly, allTime } = creatorTraders
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  const [creatorRank, setCreatorRank] = useState<number | undefined>()
  const [unresolvedMarkets, setUnresolvedMarkets] = useState<number>(0)

  useEffect(() => {
    getTotalContractsCreated(creator.id).then(setMarketsCreated)
    getCreatorRank(allTime, 'allTime').then(setCreatorRank)
    getUnresolvedContractsCount(creator.id, db).then((count) =>
      setUnresolvedMarkets(count)
    )
  }, [creator.id, allTime])

  const user = useUser()
  const router = useRouter()
  const seeClosed = () => {
    router.replace({ query: { ...router.query, f: 'closed' } }, undefined, {
      shallow: true,
    })
  }

  return (
    <Col className={'w-full'}>
      <Row className={'gap-8 pb-4'}>
        <MarketStats
          title={'Creator rank'}
          total={`#${formatWithCommas(creatorRank ?? 0)}`}
        />
        <MarketStats
          title={'Total questions'}
          total={formatWithCommas(marketsCreated ?? 0)}
          subTitle={
            unresolvedMarkets === 0 ? null : (
              <Tooltip text={'Closed and waiting for resolution'}>
                <button
                  className="bg-scarlet-300 text-ink-0 min-w-[15px] cursor-pointer rounded-full p-[2px] text-center text-[10px] leading-3"
                  onClick={seeClosed}
                >
                  {`${unresolvedMarkets}`}
                </button>
              </Tooltip>
            )
          }
        />
        <MarketStats
          title={'Traders'}
          total={formatWithCommas(allTime ?? 0)}
          subTitle={
            allTime === 0 ? (
              <></>
            ) : (
              <span
                className={clsx(
                  'text-sm',
                  weekly > 0 ? 'text-teal-500' : 'text-scarlet-500'
                )}
              >
                <Tooltip text={'7-day change'}>
                  {weekly > 0 ? '+' : ''}
                  {Math.round((weekly * 100) / allTime)}%
                </Tooltip>
              </span>
            )
          }
        />
      </Row>
      <SupabaseSearch
        defaultFilter="all"
        defaultSort="newest"
        additionalFilter={{
          creatorId: creator.id,
        }}
        persistPrefix={`user-contracts-list-${creator.id}`}
        useUrlParams
        emptyState={
          <>
            <div className="text-ink-700 mx-2 mt-3 text-center">
              No questions found
            </div>
            {creator.id === user?.id && (
              <Row className={'mt-8 justify-center'}>
                <CreateQuestionButton className={'max-w-[15rem]'} />
              </Row>
            )}
          </>
        }
        contractsOnly
      />
    </Col>
  )
}

const MarketStats = (props: {
  title: string
  total: string
  subTitle?: ReactNode
}) => {
  const { title, total, subTitle } = props
  return (
    <Col>
      <div className="text-ink-600 text-xs sm:text-sm">{title}</div>
      <Row className="items-center gap-2">
        <span className="text-primary-600 text-lg sm:text-xl">{total}</span>
        {subTitle}
      </Row>
    </Col>
  )
}
