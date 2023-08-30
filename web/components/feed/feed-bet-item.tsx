import { Contract, contractPath } from 'common/contract'
import { ClickFrame } from '../widgets/click-frame'
import { useRouter } from 'next/router'
import { PositionChangeData } from 'common/supabase/bets'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import clsx from 'clsx'
import { CreatorDetails } from 'common/feed'
import { Answer } from 'common/answer'
import { formatMoney, formatPercent } from 'common/util/format'
import { OutcomeLabel } from 'web/components/outcome-label'

// not combining bet amounts on the backend (where the values are filled in on the comment)
export const FeedBetsItem = (props: {
  contract: Contract
  betData: PositionChangeData
  creatorDetails: CreatorDetails
  answers: Answer[] | undefined
}) => {
  const { contract, answers, creatorDetails, betData } = props
  const router = useRouter()
  const { avatarUrl, username, name } = creatorDetails
  const { previous, beforeProb, afterProb, change, current } = betData
  const saleAmount =
    previous?.outcome === current?.outcome &&
    (previous?.invested ?? 0) > (current?.invested ?? 0)
      ? change
      : previous?.invested ?? 0

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
          {saleAmount !== 0 && previous?.outcome && (
            <span>
              {`sold ${formatMoney(Math.abs(saleAmount))}`}{' '}
              <OutcomeLabel
                contract={contract}
                outcome={previous.outcome}
                truncate={'short'}
              />
            </span>
          )}
          {previous && Math.abs(change) > previous.invested && (
            <span>{' and'}</span>
          )}{' '}
          {previous?.outcome !== current?.outcome && current?.outcome && (
            <span>
              {`bought ${formatMoney(current.invested)} `}
              <OutcomeLabel
                contract={contract}
                outcome={current.outcome}
                truncate={'short'}
              />
            </span>
          )}{' '}
          from {formatPercent(beforeProb)} to {formatPercent(afterProb)}
          {answers && answers.length > 0 && <span> of {answers[0].text}</span>}
        </span>
      </div>
    </ClickFrame>
  )
}
