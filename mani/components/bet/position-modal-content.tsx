import { Contract, isBinaryMulti } from 'common/contract'
import { useRef, useState } from 'react'

import { api } from 'lib/api'

import { TRADE_TERM } from 'common/envs/constants'
import { useUnfilledBetsAndBalanceByUserId } from 'client-common/hooks/use-bets'
import { useIsPageVisible } from 'hooks/use-is-page-visibile'
import { getSaleResult, getSaleResultMultiSumsToOne } from 'common/sell-bet'
import { uniq } from 'lodash'
import { LimitBet } from 'common/bet'
import { Fees, getFeeTotal } from 'common/fees'
import { getCpmmProbability } from 'common/calculate-cpmm'
import {
  formatLargeNumber,
  formatShares,
  formatPercent,
} from 'common/util/format'
import { APIError } from 'common/api/utils'

import { getMappedValue } from 'common/pseudo-numeric'
import { useUser } from 'hooks/use-user'
import { useColor } from 'hooks/use-color'
import { getPayoutInfo } from 'common/payouts'
import { BinaryOutcomes } from 'components/contract/bet/bet-panel'
import { PositionModalMode } from './position-modal'
import { ContractMetric } from 'common/contract-metric'
import { KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native'
import { Col } from 'components/layout/col'
import { router } from 'expo-router'
import { ThemedText } from 'components/themed-text'
import { TokenNumber } from 'components/token/token-number'
import { Row } from 'components/layout/row'
import { Button } from 'components/buttons/button'
import Slider from '@react-native-community/slider'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'

export function PositionModalContent({
  contract,
  metric,
  answerId,
  outcome,
  multiProps,
  setOpen,
  mode,
  setMode,
  onSaleSuccess,
}: {
  contract: Contract
  answerId?: string
  outcome: BinaryOutcomes
  metric: ContractMetric
  setOpen: (open: boolean) => void
  mode: PositionModalMode
  setMode: (mode: PositionModalMode) => void
  onSaleSuccess?: (details: {
    amount: number
    saleValue: number
    profit: number
  }) => void
}) {
  const user = useUser()
  const color = useColor()
  const isBinaryMC = isBinaryMulti(contract)
  const { hasYesShares } = metric

  const answer =
    answerId && 'answers' in contract
      ? contract.answers.find((a) => a.id === answerId)
      : undefined

  const { canSell, won, payoutWord } = getPayoutInfo(contract, metric, answer)

  const { outcomeType } = contract
  const { totalShares, maxSharesOutcome } = metric ?? {
    totalShares: { YES: 0, NO: 0 },
    maxSharesOutcome: 'YES',
  }

  const shares = totalShares[outcome] ?? 0
  const sharesOutcome = maxSharesOutcome as 'YES' | 'NO' | undefined

  const isMultiSumsToOne =
    (outcomeType === 'MULTIPLE_CHOICE' && contract.shouldAnswersSumToOne) ||
    outcomeType === 'NUMBER'

  const { unfilledBets: allUnfilledBets, balanceByUserId } =
    useUnfilledBetsAndBalanceByUserId(
      contract.id,
      (params) => api('bets', params),
      (params) => api('users/by-id/balance', params),
      useIsPageVisible
    )

  const unfilledBets =
    answerId && !isMultiSumsToOne
      ? allUnfilledBets.filter((b) => b.answerId === answerId)
      : allUnfilledBets

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
  const betDeps = useRef<LimitBet[]>(undefined)

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
        if (onSaleSuccess) {
          onSaleSuccess({
            amount: sellQuantity,
            saleValue: saleValue,
            profit: profit,
          })
        }
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
    const realAmount = displayAmount
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

  const buyingNoun = isBinaryMC
    ? answer?.shortText
    : hasYesShares
    ? 'YES'
    : 'NO'
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 108 : 0}
      style={{
        flex: 1,
        justifyContent: 'flex-start',
        flexDirection: 'column',
      }}
    >
      <Col
        style={{
          flex: 1,
          justifyContent: 'space-between',
          paddingBottom: 16,
        }}
      >
        <Col style={{ gap: 4 }}>
          <TouchableOpacity
            onPress={() => {
              router.push(`/${contract.creatorUsername}/${contract.slug}`)
              setOpen(false)
            }}
          >
            <ThemedText size="lg" weight="semibold">
              {contract.question}
            </ThemedText>
          </TouchableOpacity>
          <ThemedText size="md">
            <ThemedText
              size="md"
              color={
                isBinaryMC
                  ? color.textSecondary
                  : hasYesShares
                  ? color.yesButtonText
                  : color.noButtonText
              }
            >
              {buyingNoun}
            </ThemedText>
            {!!answer && !isBinaryMC && (
              <ThemedText color={color.textSecondary}>
                {' '}
                • {answer.text}
              </ThemedText>
            )}
          </ThemedText>
        </Col>
        <Col style={{ gap: 12, alignItems: 'center' }}>
          <ThemedText color={color.textTertiary} size="lg">
            {mode == 'sell'
              ? 'Sell amount'
              : won
              ? 'Paid out'
              : 'Current value'}
          </ThemedText>
          <TokenNumber amount={saleValue + totalFees} size="5xl" />
          {mode == 'sell' && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              style={{ width: '100%' }}
            >
              <Slider
                value={amount ? amount / shares : 1}
                onValueChange={(value) => {
                  const newAmount = Math.floor(shares * value)
                  setDisplayAmount(newAmount)
                  setAmount(newAmount)

                  // Check for errors
                  if (newAmount !== undefined && newAmount > shares) {
                    setError(
                      `Maximum ${formatShares(
                        Math.floor(shares),
                        isCashContract
                      )} shares`
                    )
                  } else {
                    setError(undefined)
                  }
                }}
                minimumValue={0}
                maximumValue={1}
                step={0.01}
                minimumTrackTintColor={color.primaryButton}
                maximumTrackTintColor={color.border}
                thumbTintColor={color.primary}
                style={{ width: '100%', height: 40 }}
              />
            </Animated.View>
          )}
        </Col>
        <Col style={{ gap: 8 }}>
          <Col style={{ gap: 8 }}>
            {mode === 'sell' && contract.token === 'CASH' && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                style={{
                  backgroundColor: color.warningBg,
                  padding: 12,
                  borderRadius: 8,
                  gap: 4,
                }}
              >
                <ThemedText color={color.warning} weight="bold">
                  Quick Tip
                </ThemedText>

                <ThemedText color={color.warning}>
                  To redeem your earnings for real cash, wait until the market
                  result is final. Selling early makes your profits
                  non-cashable.
                </ThemedText>
              </Animated.View>
            )}
            <Row style={{ justifyContent: 'space-between', width: '100%' }}>
              <ThemedText color={color.textTertiary} size="lg">
                {won ? 'Profit' : 'Current profit'}
              </ThemedText>

              {/* TODO: get real payout */}
              <Row style={{ alignItems: 'center', gap: 4 }}>
                <TokenNumber amount={profit} size="lg" />
              </Row>
            </Row>
          </Col>
          {canSell && mode !== 'sell' && (
            <Row style={{ gap: 12, width: '100%' }}>
              <Button
                onPress={() => setMode('buy more')}
                style={{ flex: 1 }}
                textProps={{
                  weight: 'normal',
                }}
                size="lg"
                variant={isBinaryMC ? 'gray' : hasYesShares ? 'yes' : 'no'}
              >
                <>Buy more {buyingNoun}</>
              </Button>
              <Button
                onPress={() => setMode('sell')}
                style={{ flex: 1 }}
                textProps={{
                  weight: 'normal',
                }}
                size="lg"
                variant={'gray'}
              >
                Sell
              </Button>
            </Row>
          )}
          {mode == 'sell' && (
            <Button
              onPress={() => {
                submitSell()
              }}
              style={{ width: '100%' }}
              textProps={{
                weight: 'normal',
              }}
              size="lg"
              variant={'primary'}
            >
              Sell
            </Button>
          )}
        </Col>
      </Col>
    </KeyboardAvoidingView>
  )
}
