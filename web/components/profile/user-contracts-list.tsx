import { User } from 'common/user'
import { ReactNode, useEffect, useState } from 'react'
import { getCreatorRank, getTotalContractCreated } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { ContractSearch } from 'web/components/contract-search'
import { Tooltip } from 'web/components/widgets/tooltip'
import { formatWithCommas } from 'common/util/format'
import { getUnresolvedContractsCount } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'

export function UserContractsList(props: { creator: User }) {
  const { creator } = props
  const { creatorTraders } = creator
  const { weekly, allTime } = creatorTraders
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  const [creatorRank, setCreatorRank] = useState<number | undefined>()
  const [unresolvedMarkets, setUnresolvedMarkets] = useState<number>(0)

  useEffect(() => {
    getTotalContractCreated(creator.id).then(setMarketsCreated)
    getCreatorRank(allTime, 'allTime').then(setCreatorRank)
    getUnresolvedContractsCount(creator.id, db).then((count) =>
      setUnresolvedMarkets(count)
    )
  }, [creator.id, allTime])

  const MarketStats = (props: {
    title: string
    total: string
    subTitle?: ReactNode
  }) => {
    const { title, total, subTitle } = props
    return (
      <Col className={clsx('')}>
        <div className="text-ink-600 text-xs sm:text-sm">{title}</div>
        <Row className={'items-center  gap-2'}>
          <span className="text-primary-600 text-lg sm:text-xl">{total}</span>
          {subTitle}
        </Row>
      </Col>
    )
  }
  return (
    <Col className={'w-full'}>
      <Row className={'gap-8 pb-4'}>
        <MarketStats
          title={'Creator rank'}
          total={`#${formatWithCommas(creatorRank ?? 0)}`}
        />
        <MarketStats
          title={'Total markets'}
          total={formatWithCommas(marketsCreated ?? 0)}
          subTitle={
            unresolvedMarkets === 0 ? null : (
              <Tooltip text={'Closed & unresolved markets'}>
                <div className="bg-scarlet-300 text-ink-0 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3 ">
                  {`${unresolvedMarkets}`}
                </div>
              </Tooltip>
            )
          }
        />
        <MarketStats
          title={'Unique traders'}
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
      <ContractSearch
        defaultFilter="all"
        defaultSort="newest"
        additionalFilter={{
          creatorId: creator.id,
        }}
        persistPrefix={`user-${creator.id}`}
        profile={true}
      />
    </Col>
  )
}
