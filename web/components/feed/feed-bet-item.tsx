import { Contract, contractPath } from 'common/contract'
import { ClickFrame } from '../widgets/click-frame'
import { useRouter } from 'next/router'
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
  const router = useRouter()
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
    <ClickFrame
      className="bg-canvas-50 my-1 flex flex-col rounded-md py-2 px-1"
      onClick={() => router.push(contractPath(contract))}
    >
      <div className={'line-clamp-2'}>
        <Avatar
          size={'xs'}
          className={'mr-1 -mt-0.5 inline-block'}
          avatarUrl={avatarUrl}
          username={username}
        />
        <UserLink
          name={name}
          username={username}
          className={clsx(
            'mr-1 inline-block max-w-[10rem] text-ellipsis sm:max-w-[12rem]'
          )}
        />
        <span>
          {previous?.outcome && saleAmount > 0 && (
            <span>
              {`sold their ${formatMoney(saleAmount)} on `}
              <OutcomeLabel
                contract={contract}
                outcome={previous.outcome}
                truncate={'short'}
              />
            </span>
          )}
          {saleAmount > 0 && purchaseAmount > 0 && <span>{' and '}</span>}
          {current?.outcome && purchaseAmount > 0 && (
            <span>
              {`bought ${formatMoney(purchaseAmount)} `}
              <OutcomeLabel
                contract={contract}
                outcome={current.outcome}
                truncate={'short'}
              />
            </span>
          )}{' '}
          {/*from {formatPercent(beforeProb)} to {formatPercent(afterProb)}*/}
          {answers && answers.length > 0 && <span> of {answers[0].text}</span>}
          <RelativeTimestamp time={betData.endTime} />
        </span>
      </div>
    </ClickFrame>
  )
}
