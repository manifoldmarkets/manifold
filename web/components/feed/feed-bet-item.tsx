import { Contract } from 'common/contract'
import { PositionChangeData } from 'common/supabase/bets'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import clsx from 'clsx'
import { CreatorDetails } from 'common/feed'
import { Answer } from 'common/answer'
import { formatMoney } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'
import { RelativeTimestamp } from 'web/components/relative-timestamp'

export const FeedBetsItem = (props: {
  contract: Contract
  betData: PositionChangeData
  creatorDetails: CreatorDetails
  answers: Answer[] | undefined
}) => {
  const { contract, answers, creatorDetails, betData } = props
  const { avatarUrl, username, name } = creatorDetails
  const { previous, change, current } = betData
  // Current lists their original investment, not their sale value
  const saleAmount =
    previous?.outcome === current?.outcome &&
    (previous?.invested ?? 0) > (current?.invested ?? 0)
      ? Math.abs(change)
      : previous?.outcome != current?.outcome
      ? previous?.invested ?? 0
      : 0

  const purchaseAmount =
    previous?.outcome === current?.outcome &&
    (previous?.invested ?? 0) < (current?.invested ?? 0)
      ? change
      : previous?.outcome != current?.outcome
      ? current?.invested ?? 0
      : 0

  return (
    <div className={'text-ink-800 flex flex-wrap gap-1 py-3'}>
      <span className={'inline-flex w-fit flex-row'}>
        <Avatar size={'xs'} avatarUrl={avatarUrl} username={username} />
        <UserLink
          name={name}
          username={username}
          className={clsx('ml-1 max-w-[10rem] text-ellipsis sm:max-w-[12rem]')}
        />
      </span>
      {previous?.outcome && saleAmount > 0 && (
        <>
          {`sold their ${formatMoney(saleAmount)} on `}
          <OutcomeLabel
            contract={contract}
            outcome={previous.outcome}
            truncate={'short'}
          />
        </>
      )}
      {saleAmount > 0 && purchaseAmount > 0 && <span>{' and '}</span>}
      {current?.outcome && purchaseAmount > 0 && (
        <>
          {`bought ${formatMoney(purchaseAmount)} `}
          <OutcomeLabel
            contract={contract}
            outcome={current.outcome}
            truncate={'short'}
          />
        </>
      )}

      {/*from {formatPercent(beforeProb)} to {formatPercent(afterProb)}*/}
      {answers && answers.length > 0 && <> of {answers[0].text}</>}
      <RelativeTimestamp time={betData.endTime} />
    </div>
  )
}
