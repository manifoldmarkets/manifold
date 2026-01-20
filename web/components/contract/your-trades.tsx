import { useBetsOnce, useUnfilledBets } from 'client-common/hooks/use-bets'
import { Bet, LimitBet } from 'common/bet'
import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { sortBy, uniqBy } from 'lodash'
import { ContractBetsTable } from 'web/components/bet/contract-bets-table'
import { LoanButton } from 'web/components/bet/loan-button'
import { YourOrders } from 'web/components/bet/order-book'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useUser } from 'web/hooks/use-user'
import { api } from 'web/lib/api/api'

export function YourTrades(props: {
  contract: Contract
  contractMetric: ContractMetric | undefined
  yourNewBets: Bet[]
}) {
  const { contract, contractMetric, yourNewBets } = props
  const user = useUser()

  const staticBets = useBetsOnce((params) => api('bets', params), {
    contractId: contract.id,
    userId: !user ? 'loading' : user.id,
    order: 'asc',
  })

  const userBets = sortBy(
    uniqBy([...yourNewBets, ...(staticBets ?? [])], 'id'),
    'createdTime'
  )
  const visibleUserBets = userBets.filter(
    (bet) => !bet.isRedemption && bet.amount !== 0
  )

  const allLimitBets =
    contract.mechanism === 'cpmm-1'
      ? // eslint-disable-next-line react-hooks/rules-of-hooks
        useUnfilledBets(
          contract.id,
          (params) => api('bets', params),
          useIsPageVisible,
          { enabled: true }
        ) ?? []
      : []
  const userLimitBets = allLimitBets.filter(
    (bet) => bet.userId === user?.id
  ) as LimitBet[]

  // Show loan button for MANA markets that are not resolved
  const showLoanButton =
    user && contract.token === 'MANA' && !contract.isResolved

  if (
    (userLimitBets.length === 0 || contract.mechanism != 'cpmm-1') &&
    visibleUserBets.length === 0
  ) {
    return null
  }

  return (
    <Col className="bg-canvas-50 rounded py-4 pb-0 sm:px-3 my-4">
      {contract.mechanism === 'cpmm-1' && (
        <YourOrders
          contract={contract}
          bets={userLimitBets}
          deemphasizedHeader
        />
      )}

      {visibleUserBets.length > 0 && contractMetric && (
        <>
          <Row className="items-center justify-between px-3 pb-1">
            <span className="text-ink-800 text-sm font-semibold">
              Your trades
            </span>
            {showLoanButton && (
              <LoanButton contractId={contract.id} user={user} />
            )}
          </Row>
          <ContractBetsTable
            contractMetric={contractMetric}
            contract={contract}
            bets={userBets}
            isYourBets
          />
        </>
      )}
    </Col>
  )
}
