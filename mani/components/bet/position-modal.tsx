import { Contract, isBinaryMulti } from 'common/contract'
import { Col } from 'components/layout/col'
import { ThemedText } from 'components/themed-text'
import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform } from 'react-native'

import { Row } from 'components/layout/row'
import { api } from 'lib/api'
import { Modal } from 'components/layout/modal'
import { TokenNumber } from 'components/token/token-number'
import { NumberText } from 'components/number-text'

import { TRADE_TERM } from 'common/envs/constants'
import { ContractMetric } from 'common/contract-metric'
import { useUnfilledBetsAndBalanceByUserId } from 'client-common/hooks/use-bets'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import { getSaleResult, getSaleResultMultiSumsToOne } from 'common/sell-bet'
import { useUserContractBets } from 'client-common/hooks/use-user-bets'
import { sumBy, uniq } from 'lodash'
import { useUser } from 'hooks/use-user'
import { LimitBet } from 'common/bet'
import { Fees, getFeeTotal } from 'common/fees'
import { getCpmmProbability } from 'common/calculate-cpmm'
import {
  formatLargeNumber,
  formatShares,
  formatPercent,
} from 'common/util/format'
import { getSharesFromStonkShares } from 'common/stonk'
import { APIError } from 'common/api/utils'

import { getMappedValue } from 'common/pseudo-numeric'
import { useColor } from 'hooks/use-color'

export function PositionModal({
  contract,
  metric,
  open,
  setOpen,
  answerId,
}: {
  contract: Contract
  open: boolean
  setOpen: (open: boolean) => void
  metric: ContractMetric
  answerId?: string
}) {
  const { outcomeType } = contract
  const isPseudoNumeric = outcomeType === 'PSEUDO_NUMERIC'
  const isStonk = outcomeType === 'STONK'
  const isMultiSumsToOne =
    (outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne) ||
    outcomeType === 'NUMBER'
  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : undefined

  const isBinaryMC = isBinaryMulti(contract)

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(contract.id, useIsPageVisible, (params) =>
      api('bets', params)
    )

  const user = useUser()
  const color = useColor()

  const userBets = useUserContractBets(
    user?.id,
    contract.id,
    (params) => api('bets', params),
    useIsPageVisible
  )

  const unfilledBets =
    answerId && !isMultiSumsToOne
      ? allUnfilledBets.filter((b) => b.answerId === answerId)
      : allUnfilledBets

  const sharesSum = sumBy(userBets, (bet) =>
    bet.outcome === 'YES' ? bet.shares : -bet.shares
  )

  const shares = Math.abs(sharesSum)
  const sharesOutcome = sharesSum > 0 ? 'YES' : 'NO'

  const [displayAmount, setDisplayAmount] = useState<number | undefined>(() => {
    const probChange = isMultiSumsToOne
      ? getSaleResultMultiSumsToOne(
          contract,
          answerId!,
          shares,
          sharesOutcome,
          unfilledBets,
          balanceByUserId
        ).probChange
      : getSaleResult(
          contract,
          shares,
          sharesOutcome,
          unfilledBets,
          balanceByUserId,
          answer
        ).probChange
    return probChange > 0.2 ? undefined : shares
  })
  const [amount, setAmount] = useState<number | undefined>(displayAmount)

  // just for the input TODO: actually display somewhere
  const [error, setError] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)

  const betDisabled =
    isSubmitting || !amount || (error && error.includes('Maximum'))

  // Sell all shares if remaining shares would be < 1
  const isSellingAllShares = amount === Math.floor(shares)

  const sellQuantity = isSellingAllShares ? shares : amount ?? 0

  const loanAmount = metric?.loan ?? 0
  const soldShares = Math.min(sellQuantity, shares)
  const saleFrac = soldShares / shares
  const loanPaid = saleFrac * loanAmount
  const isLoadPaid = loanPaid === 0

  const invested = metric?.invested ?? 0
  const costBasis = invested * saleFrac
  const betDeps = useRef<LimitBet[]>([])

  async function submitSell() {
    if (!user || !amount) return

    setError(undefined)
    setIsSubmitting(true)

    await api('market/:contractId/sell', {
      shares: isSellingAllShares ? undefined : amount,
      outcome: sharesOutcome,
      contractId: contract.id,
      answerId,
      deps: uniq(betDeps.current?.map((b) => b.userId)),
    })
      .then(() => {
        setIsSubmitting(false)
        setWasSubmitted(true)
        setAmount(undefined)
      })
      .catch((e: unknown) => {
        console.error(e)
        if (e instanceof APIError) {
          const message = e.message.toString()
          // toast.error(
          //   message.includes('could not serialize access')
          //     ? 'Error placing bet'
          //     : message
          // )
        } else {
          setError(`Error placing ${TRADE_TERM}`)
        }
        setIsSubmitting(false)
      })

    // track('sell shares', {
    //   outcomeType: contract.outcomeType,
    //   slug: contract.slug,
    //   contractId: contract.id,
    //   shares: sellQuantity,
    //   outcome: sharesOutcome,
    // })
  }

  let initialProb: number, saleValue: number
  let fees: Fees
  let cpmmState
  let makers: LimitBet[]
  if (isMultiSumsToOne) {
    ;({ initialProb, cpmmState, saleValue, fees, makers } =
      getSaleResultMultiSumsToOne(
        contract,
        answerId!,
        sellQuantity,
        sharesOutcome,
        unfilledBets,
        balanceByUserId
      ))
  } else {
    ;({ initialProb, cpmmState, saleValue, fees, makers } = getSaleResult(
      contract,
      sellQuantity,
      sharesOutcome,
      unfilledBets,
      balanceByUserId,
      answer
    ))
  }
  betDeps.current = makers
  const totalFees = getFeeTotal(fees)
  const netProceeds = saleValue - loanPaid
  const profit = saleValue - costBasis
  const resultProb = getCpmmProbability(cpmmState.pool, cpmmState.p)

  console.log(initialProb, resultProb)

  const rawDifference = Math.abs(
    getMappedValue(contract, resultProb) - getMappedValue(contract, initialProb)
  )
  const displayedDifference =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? formatLargeNumber(rawDifference)
      : formatPercent(rawDifference)
  const probChange = Math.abs(resultProb - initialProb)

  const warning =
    probChange >= 0.3
      ? `Are you sure you want to move the probability by ${displayedDifference}?`
      : undefined

  const onAmountChange = (displayAmount: number | undefined) => {
    setDisplayAmount(displayAmount)
    const realAmount = isStonk
      ? getSharesFromStonkShares(contract, displayAmount ?? 0, shares)
      : displayAmount
    setAmount(realAmount)

    // Check for errors.
    if (realAmount !== undefined && realAmount > shares) {
      setError(
        `Maximum ${formatShares(Math.floor(shares), isCashContract)} shares`
      )
    } else {
      setError(undefined)
    }
  }
  const isCashContract = contract.token === 'CASH'
  console.log(contract.question, answer?.text, saleValue, netProceeds, shares,
  sellQuantity,
  soldShares,
  amount)
  // TODO: figure out keyboard clicking behavior
  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} mode="close" showHeader>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 108 : 0}
        style={{
          flex: 1,
          justifyContent: 'flex-start',
          flexDirection: 'column',
          paddingBottom: 16,
        }}
      >
        <Col style={{ flex: 1, justifyContent: 'space-between' }}>
          <Col style={{ gap: 4 }}>
            <ThemedText size="lg" weight="semibold">
              {contract.question}
            </ThemedText>

            <ThemedText size="md" color={color.textSecondary}>
              {!!answer && !isBinaryMC && answer.text}
            </ThemedText>
          </Col>
          <Col style={{ gap: 12, alignItems: 'center' }}>
            <TokenNumber amount={saleValue + totalFees} size="5xl" />
          </Col>
          <Col style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between', width: '100%' }}>
              <ThemedText color={color.textTertiary} size="lg">
                Payout if win
              </ThemedText>

              {/* TODO: get real payout */}
              <Row style={{ alignItems: 'center', gap: 4 }}>
                <TokenNumber amount={netProceeds} size="lg" />
                <NumberText size="lg" color={color.profitText}>
                  (+200%)
                </NumberText>
              </Row>
            </Row>
            {/* {isBinaryMC ? (
              <Button
                size="lg"
                onPress={onPress}
                disabled={loading || error !== null}
                loading={loading}
              >
                <ThemedText weight="normal">
                  Buy{' '}
                  <ThemedText weight="semibold">
                    {multiProps?.answerToDisplay?.text ??
                      multiProps?.answerToBuy?.text}
                  </ThemedText>
                </ThemedText>
              </Button>
            ) : (
              <YesNoButton
                disabled={loading || error !== null}
                loading={loading}
                variant={outcome === 'YES' ? 'yes' : 'no'}
                size="lg"
                title={`Buy ${outcome === 'YES' ? 'Yes' : 'No'}`}
                onPress={onPress}
              />
            )} */}
          </Col>
        </Col>
      </KeyboardAvoidingView>
    </Modal>
  )
}
