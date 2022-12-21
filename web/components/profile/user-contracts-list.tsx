import { User } from 'common/user'
import { ReactNode, useEffect, useState } from 'react'
import { getCreatorRank, getTotalContractCreated } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { ContractSearch } from 'web/components/contract-search'
import { Tooltip } from 'web/components/widgets/tooltip'
import { formatWithCommas } from 'common/util/format'

export function UserContractsList(props: { creator: User }) {
  const { creator } = props
  const { creatorTraders } = creator
  const { weekly, allTime } = creatorTraders
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  const [creatorRank, setCreatorRank] = useState<number | undefined>()

  useEffect(() => {
    getTotalContractCreated(creator.id).then(setMarketsCreated)
    getCreatorRank(allTime, 'allTime').then(setCreatorRank)
  }, [creator.id, allTime])

  const MarketStats = (props: {
    title: string
    total: string
    subTitle?: ReactNode
  }) => {
    const { title, total, subTitle } = props
    return (
      <Col className={clsx('')}>
        <div className="text-xs text-gray-600 sm:text-sm">{title}</div>
        <Row className={'items-center  gap-2'}>
          <span className="text-lg text-indigo-600 sm:text-xl">{total}</span>
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
      <Row>
        <ContractSearch
          headerClassName="sticky"
          defaultSort="newest"
          defaultFilter="all"
          additionalFilter={{
            creatorId: creator.id,
          }}
          persistPrefix={`user-${creator.id}`}
          profile={true}
        />
      </Row>
    </Col>
  )
}
