import { ChatIcon, UserIcon } from '@heroicons/react/solid'
import { Contract } from 'common/contract'
import { useNumContractComments } from 'web/hooks/use-comments'
import { shortenNumber } from 'common/util/formatNumber'
import { Row } from '../layout/row'
import { Action } from './contract-table-action'
import { ContractStatusLabel } from './contracts-table'
import { useHasContractMetrics } from 'web/hooks/use-saved-contract-metrics'
import { Tooltip } from '../widgets/tooltip'
import { BoostedTooltip } from './boost-column'
import {
  getTierIndexFromLiquidity,
  getTierIndexFromLiquidityAndAnswers,
} from 'common/src/tier'
import { formatWithToken } from 'common/util/format'
import { BsDroplet, BsDropletFill, BsDropletHalf } from 'react-icons/bs'
import clsx from 'clsx'

export type ColumnFormat = {
  header: string
  content: (props: { contract: Contract }) => JSX.Element
  width: string
}
const TradersColumnComponent = (props: { contract: Contract }) => {
  const { contract } = props
  const { outcomeType, uniqueBettorCount } = contract
  const hasMetric = useHasContractMetrics(contract.id)
  return outcomeType == 'BOUNTIED_QUESTION' ? (
    <div className="text-ink-700 h-min align-top">
      <BountiedContractComments contractId={contract.id} />
    </div>
  ) : (
    <Tooltip
      text={`${contract.uniqueBettorCount} unique traders ${
        hasMetric ? '(including you)' : ''
      }`}
    >
      <div className="text-ink-700 ml-1 h-min align-top">
        <Row className="align-left text-ink-700 h-full shrink-0 items-center justify-start gap-0.5">
          <UserIcon
            className={
              !hasMetric
                ? 'text-ink-400 h-4 w-4 shrink-0'
                : 'text-primary-600 h-4 w-4 shrink-0'
            }
          />
          {shortenNumber(uniqueBettorCount ?? 0)}
        </Row>
      </div>
    </Tooltip>
  )
}
export const traderColumn = {
  header: 'Traders',
  content: TradersColumnComponent,
  width: 'w-[70px]',
}

export const probColumn = {
  header: 'Stat',
  content: (props: { contract: Contract }) => {
    const { contract } = props
    return (
      <ContractStatusLabel
        contract={contract}
        showProbChange={
          contract.uniqueBettorCountDay !== contract.uniqueBettorCount
        }
        className="block w-[3ch] text-right"
        width={'w-[65px]'}
      />
    )
  },
  width: 'w-[80px]',
}

// export const tierColumn = {
//   header: 'Tier',
//   content: (props: { contract: Contract }) => {
//     const { contract } = props
//     const marketTier = contract.marketTier
//     return (
//       <TierTooltip
//         placement={'top'}
//         tier={marketTier!}
//         contract={contract}
//         noTitle
//         className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
//         iconClassName="absolute inset-0 top-[0.2em]"
//       />
//     )
//   },
//   width: 'w-8',
// }

export const boostedColumn = {
  header: 'Boosted',
  content: (props: { contract: Contract }) => {
    const { contract } = props
    return (
      <BoostedTooltip
        boosted={contract.boosted}
        placement={'top'}
        // noTitle
        className="relative mr-0.5 inline-flex h-[1em] w-[1.1em] items-baseline"
        iconClassName="absolute inset-0 top-[0.2em]"
      />
    )
  },
  width: 'w-6',
}

export const liquidityColumn = {
  header: 'Liquidity',
  content: (props: { contract: Contract }) => {
    const { contract } = props

    const hasAnswers = contract.mechanism === 'cpmm-multi-1'
    const isCashContract = contract.token === 'CASH'
    const totalLiquidity =
      'totalLiquidity' in contract ? contract.totalLiquidity : 0
    const liquidityTier = hasAnswers
      ? getTierIndexFromLiquidityAndAnswers(
          totalLiquidity,
          contract.answers.length
        ) - 1
      : getTierIndexFromLiquidity(totalLiquidity)

    const shownLiquidity = hasAnswers
      ? totalLiquidity / contract.answers.length
      : totalLiquidity
    return (
      <Tooltip
        text={`Total liquidity: ${formatWithToken({
          amount: totalLiquidity,
          token: isCashContract ? 'CASH' : 'M$',
          short: true,
        })} ${
          hasAnswers
            ? `(per answer: ${formatWithToken({
                amount: shownLiquidity,
                token: isCashContract ? 'CASH' : 'M$',
                short: true,
              })})`
            : ''
        }`}
      >
        <Row className="text-ink-500 items-center justify-start gap-0.5">
          {liquidityTier < 1 ? (
            <BsDroplet className={clsx('h-3.5 w-3.5')} />
          ) : liquidityTier < 2 ? (
            <BsDropletHalf className={clsx('h-3.5 w-3.5')} />
          ) : (
            <BsDropletFill className={clsx('h-3.5 w-3.5')} />
          )}
          <span className="text-ink-700 block sm:hidden">
            {formatWithToken({
              amount: shownLiquidity,
              token: isCashContract ? 'CASH' : 'M$',
              short: true,
            })}
          </span>
        </Row>
      </Tooltip>
    )
  },
  width: 'sm:w-[40px] w-[70px]',
}

export const actionColumn = {
  header: 'Action',
  content: (props: { contract: Contract }) => (
    <Action contract={props.contract} />
  ),
  width: 'w-12',
}

function BountiedContractComments(props: { contractId: string }) {
  const { contractId } = props
  const numComments = useNumContractComments(contractId)
  return (
    <Row className="align-center shrink-0 items-center gap-0.5">
      <ChatIcon className="h-4 w-4" />
      {numComments}
    </Row>
  )
}
