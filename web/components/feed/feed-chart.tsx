import { BinaryContract } from 'common/contract'
import { useEffect, useState } from 'react'
import { BinaryChart } from '../contract/contract-overview'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import PlaceholderGraph from 'web/lib/icons/placeholder-graph.svg'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { applyBetsFilter } from 'common/supabase/bets'
import { db } from 'web/lib/supabase/db'
import { Row, run, tsToMillis } from 'common/supabase/utils'
import { first, last, maxBy, minBy, sortBy } from 'lodash'
import dayjs from 'dayjs'

export function FeedBinaryChart(props: {
  contract: BinaryContract
  startDate: number | undefined
  className?: string
  addLeadingBetPoint?: boolean
}) {
  const { contract, addLeadingBetPoint, className, startDate } = props

  const [bets, setBets] = usePersistentInMemoryState<
    Partial<Row<'contract_bets'>>[] | null | undefined
  >(undefined, `${contract.id}-feed-chart`)

  // cache the current time so we don't re-render the chart every time
  const [now] = useState(Date.now())
  const startingDate = startDate ? startDate : now - DAY_MS

  useEffect(() => {
    let q = db
      .from('contract_bets')
      .select('created_time, prob_before, prob_after, data->answerId')
      .order('bet_id') // get "random" points so it doesn't bunch up at the end
    q = applyBetsFilter(q, {
      contractId: contract.id,
      limit: 1000,
      filterRedemptions: true,
      afterTime: startingDate,
    })
    run(q).then(({ data }) => {
      if (data && data.length > 0) {
        setBets(sortBy(data, 'created_time'))
      }
    })
  }, [startDate, contract.id])

  const max = Math.max(
    maxBy(bets, 'prob_after')?.prob_after ?? 1,
    maxBy(bets, 'prob_before')?.prob_before ?? 1
  )
  const min = Math.min(
    minBy(bets, 'prob_after')?.prob_after ?? 0,
    minBy(bets, 'prob_before')?.prob_before ?? 0
  )
  const percentBounds = {
    max,
    min,
  }

  // We want both before and after probs, as the prob may have been sitting for a while, and if
  // we limit bets by the startDate, we may not capture the bet that brought it to that stasis.
  const points = bets
    ?.filter((r: any) => r.prob_after != r.prob_before)
    ?.map((r: any) => [
      {
        x: tsToMillis(r.created_time) - 1,
        y: r.prob_before as number,
        answerId: r.answerId as string,
      },
      {
        x: tsToMillis(r.created_time),
        y: r.prob_after as number,
        answerId: r.answerId as string,
      },
    ])
    .flat()
  const leadingBetTime = dayjs(last(points)?.x).diff(
    dayjs(first(points)?.x),
    'day'
  )
  if (points && points.length > 0 && !!points[0]) {
    if (addLeadingBetPoint) {
      points.unshift({
        x: startingDate - leadingBetTime * HOUR_MS,
        y: points[0].y,
        answerId: points[0].answerId,
      })
    }
    return (
      <BinaryChart
        betPoints={points}
        contract={contract}
        percentBounds={percentBounds}
        className={className}
        size={'sm'}
      />
    )
  }

  if (points === undefined) {
    return (
      <div
        className="my-2"
        style={{
          height: `${92}px`,
          margin: '20px 40px 20px 10px',
        }}
      >
        <PlaceholderGraph className="text-ink-400 h-full w-full animate-pulse" />
      </div>
    )
  }

  return <></>
}
