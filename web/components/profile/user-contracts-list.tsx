import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getTotalContractCreated } from 'web/lib/firebase/users'
import { Col } from 'web/components/layout/col'
import clsx from 'clsx'
import { Row } from 'web/components/layout/row'
import { ContractSearch } from 'web/components/contract-search'

export function UserContractsList(props: { creator: User }) {
  const { creator } = props
  const [marketsCreated, setMarketsCreated] = useState<number | undefined>()
  useEffect(() => {
    getTotalContractCreated(creator.id).then(setMarketsCreated)
  }, [creator.id])

  const { creatorTraders } = creator
  const MarketStats = (props: {
    title: string
    total: number
    weeklyChange: number | undefined
  }) => {
    const { title, total, weeklyChange } = props
    return (
      <Col className={clsx('')}>
        <div className="text-xs text-gray-600 sm:text-sm">{title}</div>
        <Row className={'items-center  gap-2'}>
          <span className="text-lg text-indigo-600 sm:text-xl">{total}</span>
          {weeklyChange ? (
            <span
              className={clsx(
                weeklyChange > 0 ? 'text-teal-500' : 'text-scarlet-500'
              )}
            >
              {weeklyChange > 0 ? '+' : ''}
              {Math.round((weeklyChange * 100) / total)}% (7d)
            </span>
          ) : (
            <div />
          )}
        </Row>
      </Col>
    )
  }
  return (
    <Col className={'w-full'}>
      <Row className={'gap-8 pb-4'}>
        <MarketStats
          title={'Total markets'}
          total={marketsCreated ?? 0}
          weeklyChange={undefined}
        />
        <MarketStats
          title={'Unique traders'}
          total={creatorTraders.allTime}
          weeklyChange={creatorTraders.weekly}
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
